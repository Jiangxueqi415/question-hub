package com.hudayouju.hudayouju.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hudayouju.hudayouju.common.Result;
import com.hudayouju.hudayouju.model.CreditLedger;
import com.hudayouju.hudayouju.model.PointLedger;
import com.hudayouju.hudayouju.model.Response;
import com.hudayouju.hudayouju.model.Survey;
import com.hudayouju.hudayouju.model.User;
import com.hudayouju.hudayouju.repository.CreditLedgerRepository;
import com.hudayouju.hudayouju.repository.PointLedgerRepository;
import com.hudayouju.hudayouju.repository.ResponseRepository;
import com.hudayouju.hudayouju.repository.SurveyRepository;
import com.hudayouju.hudayouju.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionAspectSupport;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class SurveyService {

    private static final long MIN_TIME_SPENT_SECONDS = 3;
    private static final double MAX_UNANSWERED_RATIO = 0.2;
    private static final double STRAIGHT_PICK_RATIO = 0.8;
    private static final String PUNCTUATION_PATTERN = "[\\p{Punct}\\s，。！？、；：“”‘’（）《》【】]";

    private final SurveyRepository surveyRepo;
    private final ResponseRepository responseRepo;
    private final UserRepository userRepo;
    private final CreditLedgerRepository creditLedgerRepo;
    private final PointLedgerRepository pointLedgerRepo;
    private final ObjectMapper objectMapper = new ObjectMapper();

    // 服务端计时器：key = userId_surveyId，避免前端伪造耗时
    private final Map<String, Long> attemptStartTimes = new ConcurrentHashMap<>();

    public SurveyService(SurveyRepository surveyRepo, ResponseRepository responseRepo,
                         UserRepository userRepo, CreditLedgerRepository creditLedgerRepo,
                         PointLedgerRepository pointLedgerRepo) {
        this.surveyRepo = surveyRepo;
        this.responseRepo = responseRepo;
        this.userRepo = userRepo;
        this.creditLedgerRepo = creditLedgerRepo;
        this.pointLedgerRepo = pointLedgerRepo;
    }

    public void startAttempt(Long surveyId, Long userId) {
        String key = userId + "_" + surveyId;
        attemptStartTimes.putIfAbsent(key, System.currentTimeMillis());
    }

    @Transactional(rollbackFor = Exception.class)
    public Result<Object> submitSurvey(Long surveyId, Long userId, Long timeSpentSeconds, String answersJson) {
        // 前端上报的耗时只作为兜底，且必须是非负整数
        if (timeSpentSeconds != null && timeSpentSeconds < 0) {
            return Result.error(400, "提交失败：timeSpentSeconds 必须是大于等于 0 的整数。");
        }

        try {
            Survey survey = surveyRepo.findById(surveyId).orElse(null);
            if (survey == null) return Result.error(400, "提交失败：问卷不存在。");

            if (LocalDateTime.now().isAfter(survey.getEndAt())) return Result.error(400, "提交失败：该问卷已截止。");
            if (survey.getOwnerId().equals(userId)) return Result.error(400, "提交失败：不能填自己发布的问卷哦！");

            Optional<Response> exist = responseRepo.findBySurveyIdAndUserId(surveyId, userId);
            if (exist.isPresent()) return Result.error(409, "提交失败：你已经提交过这份问卷了！");

            JsonNode questions = parseJson(survey.getQuestionsJson());
            if (questions != null && questions.isObject() && questions.has("questions")) {
                questions = questions.get("questions");
            }
            if (questions == null || !questions.isArray() || questions.isEmpty()) {
                return Result.error(400, "提交失败：问卷题目数据异常，无法核验作答内容。");
            }

            // answers 为空按“全部漏答”处理，不能当成格式错误绕过扣分
            JsonNode answers = null;
            if (answersJson != null && !answersJson.trim().isEmpty()) {
                answers = parseJson(answersJson);
                if (answers == null) {
                    return Result.error(400, "提交失败：answers 必须是合法的 JSON 数组。");
                }
            }

            // 服务端计时优先；没有 /start 记录时才退回前端上报值
            String key = userId + "_" + surveyId;
            Long startTime = attemptStartTimes.remove(key);
            long realTimeSpent;
            if (startTime != null) {
                realTimeSpent = Math.max(0, (System.currentTimeMillis() - startTime) / 1000);
            } else if (timeSpentSeconds != null) {
                realTimeSpent = timeSpentSeconds;
            } else {
                return Result.error(400, "提交失败：缺少作答计时信息，请先调用 /start 开始作答。");
            }

            int total = questions.size();
            int unanswered = 0;
            List<Integer> picks = new ArrayList<>();
            for (int i = 0; i < total; i++) {
                JsonNode question = questions.get(i);
                JsonNode answer = answerAt(answers, i);
                if (!isAnswered(question, answer)) {
                    unanswered++;
                    continue;
                }
                Integer pick = firstPick(question, answer);
                if (pick != null) picks.add(pick);
            }

            // 漏答率 > 20%：不发积分，扣 5 信誉，记录为 incomplete
            if ((double) unanswered / total > MAX_UNANSWERED_RATIO) {
                saveResponse(surveyId, userId, "incomplete", "[\"miss\"]", answersJson);
                User user = userRepo.findById(userId).orElse(null);
                if (user != null) {
                    user.setCredit(user.getCredit() - 5);
                    userRepo.save(user);

                    CreditLedger creditLedger = new CreditLedger();
                    creditLedger.setUserId(user.getId());
                    creditLedger.setDelta(-5);
                    creditLedger.setReason("未答完问卷（漏答 " + unanswered + "/" + total + " 题）");
                    creditLedger.setSurveyId(surveyId);
                    creditLedger.setBalanceAfter(user.getCredit());
                    creditLedgerRepo.save(creditLedger);
                }
                int percent = (int) Math.round(unanswered * 100.0 / total);
                return Result.error(400, "提交被拦截：漏答 " + unanswered + "/" + total
                        + " 题（漏答率 " + percent + "%），本次不发积分，并扣除 5 信誉。");
            }

            List<String> flags = new ArrayList<>();
            if (realTimeSpent < MIN_TIME_SPENT_SECONDS) flags.add("fast");
            if (isStraight(picks)) flags.add("straight");

            if (!flags.isEmpty()) {
                saveResponse(surveyId, userId, "invalid", flagsJson(flags), answersJson);
                return Result.error(400, "提交被拦截：检测到异常作答行为（" + describeFlags(flags) + "），本次无法获得积分。");
            }

            saveResponse(surveyId, userId, "valid", "[]", answersJson);

            User user = userRepo.findById(userId).orElse(null);
            if (user != null) {
                user.setPoints(user.getPoints() + 5);
                user.setCredit(user.getCredit() + 5);
                userRepo.save(user);

                CreditLedger creditLedger = new CreditLedger();
                creditLedger.setUserId(user.getId());
                creditLedger.setDelta(5);
                creditLedger.setReason("有效完成问卷");
                creditLedger.setSurveyId(surveyId);
                creditLedger.setBalanceAfter(user.getCredit());
                creditLedgerRepo.save(creditLedger);

                PointLedger pointLedger = new PointLedger();
                pointLedger.setUserId(user.getId());
                pointLedger.setDelta(5);
                pointLedger.setReason("有效完成问卷");
                pointLedger.setSurveyId(surveyId);
                pointLedger.setBalanceAfter(user.getPoints());
                pointLedgerRepo.save(pointLedger);
            }
            return Result.success("提交成功！获得 5 积分 / 5 信誉");
        } catch (Exception e) {
            e.printStackTrace();
            // 已进入事务，出现异常必须回滚，避免只写了一半的答卷/流水
            if (TransactionSynchronizationManager.isActualTransactionActive()) {
                TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
            }
            return Result.error(500, "提交失败：系统开小差了");
        }
    }

    private JsonNode parseJson(String json) {
        if (json == null || json.trim().isEmpty()) return null;
        try {
            return objectMapper.readTree(json);
        } catch (Exception e) {
            return null;
        }
    }

    // answers 支持数组（按题目下标）或以 "0"/"q1" 为键的对象
    private JsonNode answerAt(JsonNode answers, int index) {
        if (answers == null) return null;
        if (answers.isArray()) {
            return index < answers.size() ? answers.get(index) : null;
        }
        if (answers.isObject()) {
            String[] keys = {"q" + (index + 1), String.valueOf(index), String.valueOf(index + 1)};
            for (String k : keys) {
                if (answers.has(k)) return answers.get(k);
            }
        }
        return null;
    }

    private boolean isAnswered(JsonNode question, JsonNode answer) {
        if (answer == null || answer.isNull() || answer.isMissingNode()) return false;

        String type = question.path("type").asText("single").toLowerCase(Locale.ROOT);
        int optionCount = question.path("options").isArray() ? question.path("options").size() : -1;

        if ("open".equals(type)) {
            if (!answer.isTextual()) return false;
            return !answer.asText().replaceAll(PUNCTUATION_PATTERN, "").trim().isEmpty();
        }

        if ("multiple".equals(type)) {
            if (!answer.isArray() || answer.isEmpty()) return false;
            for (JsonNode pick : answer) {
                Integer idx = toOptionIndex(pick);
                if (idx == null || !isValidIndex(idx, optionCount)) return false;
            }
            return true;
        }

        // 单选题也兼容 [0] 这种只含一个元素的数组写法
        JsonNode singleValue = answer;
        if (answer.isArray()) {
            if (answer.size() != 1) return false;
            singleValue = answer.get(0);
        }
        Integer idx = toOptionIndex(singleValue);
        return idx != null && isValidIndex(idx, optionCount);
    }

    private Integer firstPick(JsonNode question, JsonNode answer) {
        String type = question.path("type").asText("single").toLowerCase(Locale.ROOT);
        if ("open".equals(type)) return null;
        if (answer == null || answer.isNull()) return null;
        if (answer.isArray()) {
            return answer.isEmpty() ? null : toOptionIndex(answer.get(0));
        }
        return toOptionIndex(answer);
    }

    // 选项下标兼容数字、"1" 这类字符串以及 A/B/C 字母
    private Integer toOptionIndex(JsonNode node) {
        if (node == null || node.isNull()) return null;
        if (node.isNumber()) {
            double value = node.asDouble();
            if (value != Math.floor(value) || value < 0 || value > Integer.MAX_VALUE) return null;
            return (int) value;
        }
        if (node.isTextual()) {
            String text = node.asText().trim();
            if (text.isEmpty()) return null;
            if (text.matches("\\d+")) {
                try {
                    return Integer.parseInt(text);
                } catch (NumberFormatException e) {
                    return null;
                }
            }
            if (text.length() == 1) {
                char c = Character.toUpperCase(text.charAt(0));
                if (c >= 'A' && c <= 'Z') return c - 'A';
            }
        }
        return null;
    }

    private boolean isValidIndex(int index, int optionCount) {
        return index >= 0 && (optionCount < 0 || index < optionCount);
    }

    private boolean isStraight(List<Integer> picks) {
        if (picks.size() < 2) return false;
        Map<Integer, Integer> counts = new HashMap<>();
        int maxSame = 0;
        for (Integer pick : picks) {
            int count = counts.merge(pick, 1, Integer::sum);
            if (count > maxSame) maxSame = count;
        }
        return (double) maxSame / picks.size() >= STRAIGHT_PICK_RATIO;
    }

    private String flagsJson(List<String> flags) {
        try {
            return objectMapper.writeValueAsString(flags);
        } catch (Exception e) {
            return "[]";
        }
    }

    private String describeFlags(List<String> flags) {
        List<String> labels = new ArrayList<>();
        for (String flag : flags) {
            if ("fast".equals(flag)) labels.add("用时不足 " + MIN_TIME_SPENT_SECONDS + " 秒");
            else if ("straight".equals(flag)) labels.add("直线作答");
            else labels.add(flag);
        }
        return String.join("、", labels);
    }

    private void saveResponse(Long surveyId, Long userId, String status, String flags, String answersJson) {
        Response response = new Response();
        response.setSurveyId(surveyId);
        response.setUserId(userId);
        response.setStatus(status);
        response.setFlagsJson(flags);
        response.setAnswersJson(answersJson);
        responseRepo.save(response);
    }
}

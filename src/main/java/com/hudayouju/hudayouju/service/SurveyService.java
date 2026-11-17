package com.hudayouju.hudayouju.service;

import com.hudayouju.hudayouju.model.Response;
import com.hudayouju.hudayouju.model.Survey;
import com.hudayouju.hudayouju.model.User;
import com.hudayouju.hudayouju.repository.ResponseRepository;
import com.hudayouju.hudayouju.repository.SurveyRepository;
import com.hudayouju.hudayouju.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Optional;

@Service
public class SurveyService {

    private final SurveyRepository surveyRepo;
    private final ResponseRepository responseRepo;
    private final UserRepository userRepo;

    public SurveyService(SurveyRepository surveyRepo, ResponseRepository responseRepo, UserRepository userRepo) {
        this.surveyRepo = surveyRepo;
        this.responseRepo = responseRepo;
        this.userRepo = userRepo;
    }

    // 🔥 S-4 修复：加上事务控制，一旦抛出异常，扣分和存答卷全部回滚
    @Transactional(rollbackFor = Exception.class)
    public String submitSurvey(Long surveyId, Long userId, long timeSpentSeconds, String answersJson) {
        try {
            Survey survey = surveyRepo.findById(surveyId).orElseThrow(() -> new RuntimeException("问卷不存在"));

            if (LocalDateTime.now().isAfter(survey.getEndAt())) {
                return "提交失败：该问卷已截止。";
            }
            if (survey.getOwnerId().equals(userId)) {
                return "提交失败：不能填自己发布的问卷哦！";
            }

            Optional<Response> exist = responseRepo.findBySurveyIdAndUserId(surveyId, userId);
            if (exist.isPresent()) {
                return "提交失败：你已经提交过这份问卷了！";
            }

            // S-6 修复：严密的漏答率与格式判断
            boolean isIncomplete = (answersJson == null ||
                    answersJson.trim().equals("[]") ||
                    answersJson.trim().equals("{}") ||
                    answersJson.trim().isEmpty() ||
                    answersJson.length() < 5); // 如果传过来的字符串极短，大概率是空的

            if (isIncomplete) {
                saveResponse(surveyId, userId, "incomplete", "[\"incomplete\"]", answersJson);
                User user = userRepo.findById(userId).orElseThrow(() -> new RuntimeException("用户不存在"));
                user.setCredit(user.getCredit() - 5);
                userRepo.save(user);
                return "提交被拦截：漏答率过高，本次不发积分，并扣除 5 信誉。";
            }

            // S-6 修复：极速与直线判断（服务端强校验）
            String flags = "[]";
            String status = "valid";

            // 如果前端没传时间，或者时间少于 3 秒
            boolean isFast = timeSpentSeconds < 3;

            // 简单粗暴的直线检测：只要包含 A 且不包含 B、C、D，就判定为全选 A
            boolean isStraight = answersJson.contains("A") &&
                    !answersJson.contains("B") &&
                    !answersJson.contains("C") &&
                    !answersJson.contains("D");

            if (isFast || isStraight) {
                status = "invalid";
                if (isFast && isStraight) {
                    flags = "[\"fast\",\"straight\"]";
                } else if (isFast) {
                    flags = "[\"fast\"]";
                } else {
                    flags = "[\"straight\"]";
                }
            }

            saveResponse(surveyId, userId, status, flags, answersJson);

            if ("valid".equals(status)) {
                User user = userRepo.findById(userId).orElseThrow(() -> new RuntimeException("用户不存在"));
                user.setPoints(user.getPoints() + 5);
                user.setCredit(user.getCredit() + 5);
                userRepo.save(user);
                return "提交成功！获得 5 积分 / 5 信誉";
            } else {
                return "提交被拦截：检测到异常作答行为（如极速作答或直线作答），本次无法获得积分。";
            }
        } catch (Exception e) {
            // 触发事务回滚
            throw new RuntimeException("提交发生异常：" + e.getMessage());
        }
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
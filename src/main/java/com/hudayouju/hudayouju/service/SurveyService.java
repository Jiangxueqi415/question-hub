package com.hudayouju.hudayouju.service;

import com.hudayouju.hudayouju.model.CreditLedger;
import com.hudayouju.hudayouju.model.Response;
import com.hudayouju.hudayouju.model.Survey;
import com.hudayouju.hudayouju.model.User;
import com.hudayouju.hudayouju.repository.CreditLedgerRepository;
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
    private final CreditLedgerRepository creditLedgerRepo;

    public SurveyService(SurveyRepository surveyRepo, ResponseRepository responseRepo,
                         UserRepository userRepo, CreditLedgerRepository creditLedgerRepo) {
        this.surveyRepo = surveyRepo;
        this.responseRepo = responseRepo;
        this.userRepo = userRepo;
        this.creditLedgerRepo = creditLedgerRepo;
    }

    @Transactional(rollbackFor = Exception.class)
    public String submitSurvey(Long surveyId, Long userId, long timeSpentSeconds, String answersJson) {
        try {
            Survey survey = surveyRepo.findById(surveyId).orElse(null);
            if (survey == null) return "提交失败：问卷不存在。";

            if (LocalDateTime.now().isAfter(survey.getEndAt())) return "提交失败：该问卷已截止。";
            if (survey.getOwnerId().equals(userId)) return "提交失败：不能填自己发布的问卷哦！";

            Optional<Response> exist = responseRepo.findBySurveyIdAndUserId(surveyId, userId);
            if (exist.isPresent()) return "提交失败：你已经提交过这份问卷了！";

            boolean isIncomplete = (answersJson == null || answersJson.trim().equals("[]") || answersJson.trim().equals("{}") || answersJson.trim().isEmpty());
            if (isIncomplete) {
                saveResponse(surveyId, userId, "incomplete", "[\"incomplete\"]", answersJson);
                User user = userRepo.findById(userId).orElse(null);
                if(user != null) {
                    user.setCredit(user.getCredit() - 5);
                    userRepo.save(user);

                    CreditLedger ledger = new CreditLedger();
                    ledger.setUserId(user.getId());
                    ledger.setDelta(-5);
                    ledger.setReason("未答完问卷");
                    ledger.setSurveyId(surveyId);
                    ledger.setBalanceAfter(user.getCredit());
                    creditLedgerRepo.save(ledger);
                }
                return "提交被拦截：漏答率过高，本次不发积分，并扣除 5 信誉。";
            }

            String flags = "[]";
            String status = "valid";
            boolean isFast = timeSpentSeconds < 3;
            boolean isStraight = answersJson.contains("A") && !answersJson.contains("B") && !answersJson.contains("C") && !answersJson.contains("D");

            if (isFast || isStraight) {
                status = "invalid";
                if (isFast && isStraight) flags = "[\"fast\",\"straight\"]";
                else if (isFast) flags = "[\"fast\"]";
                else flags = "[\"straight\"]";
            }

            saveResponse(surveyId, userId, status, flags, answersJson);

            if ("valid".equals(status)) {
                User user = userRepo.findById(userId).orElse(null);
                if (user != null) {
                    user.setPoints(user.getPoints() + 5);
                    user.setCredit(user.getCredit() + 5);
                    userRepo.save(user);

                    CreditLedger ledger = new CreditLedger();
                    ledger.setUserId(user.getId());
                    ledger.setDelta(5);
                    ledger.setReason("有效完成问卷");
                    ledger.setSurveyId(surveyId);
                    ledger.setBalanceAfter(user.getCredit());
                    creditLedgerRepo.save(ledger);
                }
                return "提交成功！获得 5 积分 / 5 信誉";
            } else {
                return "提交被拦截：检测到异常作答行为，本次无法获得积分。";
            }
        } catch (Exception e) {
            e.printStackTrace();
            return "提交失败：系统开小差了，请稍后再试。";
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
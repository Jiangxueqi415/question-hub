package com.hudayouju.hudayouju.service;

import com.hudayouju.hudayouju.model.Response;
import com.hudayouju.hudayouju.model.Survey;
import com.hudayouju.hudayouju.model.User;
import com.hudayouju.hudayouju.repository.ResponseRepository;
import com.hudayouju.hudayouju.repository.SurveyRepository;
import com.hudayouju.hudayouju.repository.UserRepository;
import org.springframework.stereotype.Service;

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

    public String submitSurvey(Long surveyId, Long userId, long timeSpentSeconds, String answersJson) {
        try {
            Survey survey = surveyRepo.findById(surveyId).orElseThrow(() -> new RuntimeException("问卷不存在"));

            if (LocalDateTime.now().isAfter(survey.getEndAt())) return "提交失败：该问卷已截止。";
            if (survey.getOwnerId().equals(userId)) return "提交失败：不能填自己发布的问卷哦！";

            Optional<Response> exist = responseRepo.findBySurveyIdAndUserId(surveyId, userId);
            if (exist.isPresent()) return "提交失败：你已经提交过这份问卷了！";

            // 漏答率判断
            boolean isIncomplete = (answersJson == null || answersJson.trim().equals("[]") || answersJson.trim().equals("{}") || answersJson.trim().isEmpty());
            if (isIncomplete) {
                saveResponse(surveyId, userId, "incomplete", "[\"incomplete\"]", answersJson);
                User user = userRepo.findById(userId).orElseThrow(() -> new RuntimeException("用户不存在"));
                user.setCredit(user.getCredit() - 5);
                userRepo.save(user);
                return "提交被拦截：漏答率过高（100%），本次不发积分，并扣除 5 信誉。";
            }

            // 极速与直线判断
            String flags = "[]";
            String status = "valid";

            // 只要包含 A 且不包含 B、C、D，就视为直线作答（不管传过来的是带引号还是没带引号的）
            boolean isStraight = answersJson.contains("A") && !answersJson.contains("B") && !answersJson.contains("C") && !answersJson.contains("D");
            boolean isFast = timeSpentSeconds < 3;

            if (isFast || isStraight) {
                status = "invalid";
                flags = isFast ? (isStraight ? "[\"fast\",\"straight\"]" : "[\"fast\"]") : "[\"straight\"]";
            }

            saveResponse(surveyId, userId, status, flags, answersJson);

            if (status.equals("valid")) {
                User user = userRepo.findById(userId).orElseThrow(() -> new RuntimeException("用户不存在"));
                user.setPoints(user.getPoints() + 5);
                user.setCredit(user.getCredit() + 5);
                userRepo.save(user);
                return "提交成功！获得 5 积分 / 5 信誉";
            } else {
                return "提交被拦截：检测到异常作答行为（如极速作答或直线作答），本次无法获得积分。";
            }
        } catch (Exception e) {
            return "提交失败：" + e.getMessage();
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
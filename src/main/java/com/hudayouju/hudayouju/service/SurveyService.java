package com.hudayouju.hudayouju.service;

import com.hudayouju.hudayouju.model.Response;
import com.hudayouju.hudayouju.model.Survey;
import com.hudayouju.hudayouju.model.User;
import com.hudayouju.hudayouju.repository.ResponseRepository;
import com.hudayouju.hudayouju.repository.SurveyRepository;
import com.hudayouju.hudayouju.repository.UserRepository;
import org.springframework.stereotype.Service;

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

    public String submitSurvey(Long surveyId, Long userId, long timeSpentSeconds) {
        Survey survey = surveyRepo.findById(surveyId).orElseThrow(() -> new RuntimeException("问卷不存在"));
        if (survey.getOwnerId().equals(userId)) {
            throw new RuntimeException("不能填自己发布的问卷哦！");
        }

        Optional<Response> exist = responseRepo.findBySurveyIdAndUserId(surveyId, userId);
        if (exist.isPresent()) {
            throw new RuntimeException("你已经提交过这份问卷了！");
        }

        String flags = "[]";
        String status = "valid";
        if (timeSpentSeconds < 3) {
            flags = "[\"fast\"]";
            status = "invalid";
        }

        Response response = new Response();
        response.setSurveyId(surveyId);
        response.setUserId(userId);
        response.setStatus(status);
        response.setFlagsJson(flags);
        response.setAnswersJson("[]");
        responseRepo.save(response);

        if (status.equals("valid")) {
            User user = userRepo.findById(userId).orElseThrow(() -> new RuntimeException("用户不存在"));
            user.setPoints(user.getPoints() + 5);
            user.setCredit(user.getCredit() + 5);
            userRepo.save(user);
            return "提交成功！获得 5 积分 / 5 信誉";
        } else {
            return "提交成功，但检测到作答时间异常（不足3秒），无法获得积分。";
        }
    }
}
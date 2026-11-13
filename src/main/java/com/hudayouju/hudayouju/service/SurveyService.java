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

    // 提交问卷核心逻辑
    public String submitSurvey(Long surveyId, Long userId, long timeSpentSeconds, String answersJson) {
        // 1. 查问卷
        Survey survey = surveyRepo.findById(surveyId).orElseThrow(() -> new RuntimeException("问卷不存在"));

        // 2. 不能填自己的问卷
        if (survey.getOwnerId().equals(userId)) {
            throw new RuntimeException("不能填自己发布的问卷哦！");
        }

        // 3. 防重复提交
        Optional<Response> exist = responseRepo.findBySurveyIdAndUserId(surveyId, userId);
        if (exist.isPresent()) {
            throw new RuntimeException("你已经提交过这份问卷了！");
        }

        // 4. 🔥 漏答率核验（PRD 6.5 规则：未答率>20% 判 incomplete）
        // 因为前端目前没传具体答案，如果 answers 为 "[]" 或空，直接视为 100% 漏答
        boolean isIncomplete = (answersJson == null || answersJson.trim().equals("[]") || answersJson.trim().isEmpty());

        if (isIncomplete) {
            Response response = new Response();
            response.setSurveyId(surveyId);
            response.setUserId(userId);
            response.setStatus("incomplete"); // 状态改为未答完
            response.setFlagsJson("[\"incomplete\"]");
            response.setAnswersJson(answersJson);
            responseRepo.save(response);

            // 按 PRD 规定：不发积分，扣 5 信誉
            User user = userRepo.findById(userId).orElseThrow(() -> new RuntimeException("用户不存在"));
            user.setCredit(user.getCredit() - 5);
            userRepo.save(user);

            return "提交被拦截：漏答率过高（100%），本次不发积分，并扣除 5 信誉。";
        }

        // 5. 防作弊（极速核验，小于3秒判无效）
        String flags = "[]";
        String status = "valid";
        if (timeSpentSeconds < 3) {
            flags = "[\"fast\"]";
            status = "invalid";
        }

        // 6. 保存作答记录
        Response response = new Response();
        response.setSurveyId(surveyId);
        response.setUserId(userId);
        response.setStatus(status);
        response.setFlagsJson(flags);
        response.setAnswersJson(answersJson);
        responseRepo.save(response);

        // 7. 结算积分
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
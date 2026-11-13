package com.hudayouju.hudayouju.controller;

import com.hudayouju.hudayouju.common.Result;
import com.hudayouju.hudayouju.model.PointLedger;
import com.hudayouju.hudayouju.model.Survey;
import com.hudayouju.hudayouju.model.User;
import com.hudayouju.hudayouju.repository.PointLedgerRepository;
import com.hudayouju.hudayouju.repository.SurveyRepository;
import com.hudayouju.hudayouju.repository.UserRepository;
import com.hudayouju.hudayouju.service.SurveyService;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/surveys")
public class SurveyController {

    private final SurveyRepository surveyRepository;
    private final UserRepository userRepository;
    private final PointLedgerRepository pointLedgerRepository;
    private final SurveyService surveyService;

    public SurveyController(SurveyRepository surveyRepository,
                            UserRepository userRepository,
                            PointLedgerRepository pointLedgerRepository,
                            SurveyService surveyService) {
        this.surveyRepository = surveyRepository;
        this.userRepository = userRepository;
        this.pointLedgerRepository = pointLedgerRepository;
        this.surveyService = surveyService;
    }

    // 1. 获取所有问卷列表
    @GetMapping
    public Result<List<Survey>> list() {
        return Result.success(surveyRepository.findAll());
    }

    // 2. 发布问卷
    @PostMapping
    public Result<Object> publish(@RequestBody Map<String, Object> body, @RequestAttribute String openid) {
        User user = userRepository.findByOpenid(openid)
                .orElseThrow(() -> new RuntimeException("用户不存在"));

        if (user.getCredit() < 40) return Result.error(403, "信誉分不足 40，无法发布");
        if (user.getPoints() < 10) return Result.error(403, "积分不足 10，无法发布");

        Survey survey = new Survey();
        survey.setOwnerId(user.getId());
        survey.setTitle((String) body.get("title"));
        survey.setCategory((String) body.get("category"));
        survey.setMinutes((Integer) body.get("minutes"));
        survey.setQuestionsJson((String) body.get("questionsJson"));
        survey.setStartAt(LocalDateTime.now());
        survey.setEndAt(LocalDateTime.now().plusDays(7));
        survey.setStatus("open");
        surveyRepository.save(survey);

        user.setPoints(user.getPoints() - 10);
        userRepository.save(user);

        PointLedger pointRecord = new PointLedger();
        pointRecord.setUserId(user.getId());
        pointRecord.setDelta(-10);
        pointRecord.setReason("发布问卷");
        pointRecord.setSurveyId(survey.getId());
        pointRecord.setBalanceAfter(user.getPoints());
        pointLedgerRepository.save(pointRecord);

        return Result.success("发布成功");
    }

    // 3. 提交问卷接口（带漏答率拦截）
    @PostMapping("/{id}/submit")
    public Result<Object> submit(@PathVariable Long id,
                                 @RequestBody Map<String, Object> body,
                                 @RequestAttribute String openid) {
        User user = userRepository.findByOpenid(openid).orElseThrow(() -> new RuntimeException("用户不存在"));

        long timeSpentSeconds = Long.parseLong(body.getOrDefault("timeSpentSeconds", "10").toString());

        // 接收前端传过来的 answers
        String answersJson = body.getOrDefault("answers", "[]").toString();

        // 传给 Service 处理
        String resultMsg = surveyService.submitSurvey(id, user.getId(), timeSpentSeconds, answersJson);

        return Result.success(resultMsg);
    }
}
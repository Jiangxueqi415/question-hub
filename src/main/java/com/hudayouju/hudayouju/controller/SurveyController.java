package com.hudayouju.hudayouju.controller;

import com.hudayouju.hudayouju.common.Result;
import com.hudayouju.hudayouju.model.Survey;
import com.hudayouju.hudayouju.model.User;
import com.hudayouju.hudayouju.repository.SurveyRepository;
import com.hudayouju.hudayouju.repository.UserRepository;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/surveys")
public class SurveyController {

    private final SurveyRepository surveyRepository;
    private final UserRepository userRepository;

    public SurveyController(SurveyRepository surveyRepository, UserRepository userRepository) {
        this.surveyRepository = surveyRepository;
        this.userRepository = userRepository;
    }

    // 获取所有问卷列表 (对应文档 6.2 首页)
    @GetMapping
    public Result<List<Survey>> list() {
        List<Survey> surveys = surveyRepository.findAll();
        return Result.success(surveys);
    }

    // 发布问卷 (对应文档 6.4)
    @PostMapping
    public Result<Object> publish(@RequestBody Map<String, Object> body, @RequestAttribute String openid) {
        // 1. 从拦截器传过来的 openid，找到当前用户
        User user = userRepository.findByOpenid(openid)
                .orElseThrow(() -> new RuntimeException("用户不存在"));

        // 2. 校验双门槛 (文档要求：信誉≥40，积分≥10)
        if (user.getCredit() < 40) {
            return Result.error(403, "信誉分不足 40，无法发布");
        }
        if (user.getPoints() < 10) {
            return Result.error(403, "积分不足 10，无法发布");
        }

        // 3. 组装问卷数据并保存
        Survey survey = new Survey();
        survey.setOwnerId(user.getId());
        survey.setTitle((String) body.get("title"));
        survey.setCategory((String) body.get("category"));
        survey.setMinutes((Integer) body.get("minutes"));
        survey.setQuestionsJson((String) body.get("questionsJson"));

        survey.setStartAt(LocalDateTime.now());
        survey.setEndAt(LocalDateTime.now().plusDays(7)); // 默认7天后截止
        survey.setStatus("open");

        surveyRepository.save(survey);

        // 4. 扣减积分 10 分
        user.setPoints(user.getPoints() - 10);
        userRepository.save(user);

        return Result.success("发布成功");
    }
}
package com.hudayouju.hudayouju.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hudayouju.hudayouju.common.Result;
import com.hudayouju.hudayouju.model.PointLedger;
import com.hudayouju.hudayouju.model.Response;
import com.hudayouju.hudayouju.model.Survey;
import com.hudayouju.hudayouju.model.User;
import com.hudayouju.hudayouju.repository.PointLedgerRepository;
import com.hudayouju.hudayouju.repository.ResponseRepository;
import com.hudayouju.hudayouju.repository.SurveyRepository;
import com.hudayouju.hudayouju.repository.UserRepository;
import com.hudayouju.hudayouju.service.SurveyService;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/surveys")
public class SurveyController {

    private final SurveyRepository surveyRepository;
    private final UserRepository userRepository;
    private final PointLedgerRepository pointLedgerRepository;
    private final ResponseRepository responseRepository;
    private final SurveyService surveyService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public SurveyController(SurveyRepository surveyRepository,
                            UserRepository userRepository,
                            PointLedgerRepository pointLedgerRepository,
                            ResponseRepository responseRepository,
                            SurveyService surveyService) {
        this.surveyRepository = surveyRepository;
        this.userRepository = userRepository;
        this.pointLedgerRepository = pointLedgerRepository;
        this.responseRepository = responseRepository;
        this.surveyService = surveyService;
    }

    @GetMapping
    public Result<List<Survey>> list() {
        return Result.success(surveyRepository.findAll());
    }

    // 🔥 S-4 修复：发布问卷加事务控制，防止扣了积分没存上问卷
    @Transactional(rollbackFor = Exception.class)
    @PostMapping
    public Result<Object> publish(@RequestBody Map<String, Object> body, @RequestAttribute String openid) {
        User user = userRepository.findByOpenid(openid).orElseThrow(() -> new RuntimeException("用户不存在"));
        if (user.getCredit() < 40) return Result.error(403, "信誉分不足 40，无法发布");
        if (user.getPoints() < 10) return Result.error(403, "积分不足 10，无法发布");

        Survey survey = new Survey();
        survey.setOwnerId(user.getId());
        survey.setTitle((String) body.get("title"));
        survey.setCategory((String) body.get("category"));
        Object minutesObj = body.get("minutes");
        survey.setMinutes(minutesObj != null ? Integer.parseInt(minutesObj.toString()) : 5);
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

    // 🔥 P0-3 修复：安全接收 answers 对象
    @PostMapping("/{id}/submit")
    public Result<Object> submit(@PathVariable Long id,
                                 @RequestBody Map<String, Object> body,
                                 @RequestAttribute String openid) {
        User user = userRepository.findByOpenid(openid).orElseThrow(() -> new RuntimeException("用户不存在"));

        // 如果没有传时间，默认给 0（直接触发极速拦截）
        long timeSpentSeconds = Long.parseLong(body.getOrDefault("timeSpentSeconds", "0").toString());

        Object answersObj = body.get("answers");
        String answersJson;
        try {
            if (answersObj instanceof String) {
                answersJson = (String) answersObj;
            } else {
                answersJson = objectMapper.writeValueAsString(answersObj);
            }
        } catch (Exception e) {
            answersJson = "{}";
        }

        String resultMsg = surveyService.submitSurvey(id, user.getId(), timeSpentSeconds, answersJson);
        return Result.success(resultMsg);
    }

    @GetMapping({"/my", "/me/surveys"})
    public Result<List<Survey>> mySurveys(@RequestAttribute String openid) {
        User user = userRepository.findByOpenid(openid).orElseThrow(() -> new RuntimeException("用户不存在"));
        return Result.success(surveyRepository.findByOwnerId(user.getId()));
    }

    @GetMapping({"/my-responses", "/me/responses"})
    public Result<List<Map<String, Object>>> myResponses(@RequestAttribute String openid) {
        User user = userRepository.findByOpenid(openid).orElseThrow(() -> new RuntimeException("用户不存在"));
        List<Response> responses = responseRepository.findByUserId(user.getId());
        List<Map<String, Object>> result = new ArrayList<>();
        for (Response r : responses) {
            Map<String, Object> map = new HashMap<>();
            map.put("id", r.getId());
            map.put("surveyId", r.getSurveyId());
            map.put("surveyTitle", surveyRepository.findById(r.getSurveyId()).map(Survey::getTitle).orElse("未知问卷"));
            map.put("status", r.getStatus());
            map.put("createdAt", r.getCreatedAt());
            result.add(map);
        }
        return Result.success(result);
    }

    @GetMapping("/{id}/stats")
    public Result<Object> getStats(@PathVariable Long id, @RequestAttribute String openid) {
        User user = userRepository.findByOpenid(openid).orElseThrow(() -> new RuntimeException("用户不存在"));
        Survey survey = surveyRepository.findById(id).orElseThrow(() -> new RuntimeException("问卷不存在"));
        if (!survey.getOwnerId().equals(user.getId())) return Result.error(403, "只有发布者才能查看统计");

        List<Response> responses = responseRepository.findBySurveyId(id);
        int validCount = 0, invalidCount = 0, incompleteCount = 0;
        for (Response r : responses) {
            if ("valid".equals(r.getStatus())) validCount++;
            else if ("invalid".equals(r.getStatus())) invalidCount++;
            else if ("incomplete".equals(r.getStatus())) incompleteCount++;
        }

        Map<String, Object> stats = new HashMap<>();
        stats.put("surveyTitle", survey.getTitle());
        stats.put("totalCollected", responses.size());
        stats.put("validCount", validCount);
        stats.put("invalidCount", invalidCount);
        stats.put("incompleteCount", incompleteCount);
        return Result.success(stats);
    }
}
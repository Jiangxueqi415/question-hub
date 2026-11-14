package com.hudayouju.hudayouju.controller;

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
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
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

    @PostMapping("/{id}/submit")
    public Result<Object> submit(@PathVariable Long id,
                                 @RequestBody Map<String, Object> body,
                                 @RequestAttribute String openid) {
        User user = userRepository.findByOpenid(openid).orElseThrow(() -> new RuntimeException("用户不存在"));
        long timeSpentSeconds = Long.parseLong(body.getOrDefault("timeSpentSeconds", "10").toString());
        String answersJson = body.getOrDefault("answers", "[]").toString();
        String resultMsg = surveyService.submitSurvey(id, user.getId(), timeSpentSeconds, answersJson);
        return Result.success(resultMsg);
    }

    @GetMapping("/my")
    public Result<List<Survey>> mySurveys(@RequestAttribute String openid) {
        User user = userRepository.findByOpenid(openid).orElseThrow(() -> new RuntimeException("用户不存在"));
        return Result.success(surveyRepository.findByOwnerId(user.getId()));
    }

    @GetMapping("/my-responses")
    public Result<List<Response>> myResponses(@RequestAttribute String openid) {
        User user = userRepository.findByOpenid(openid).orElseThrow(() -> new RuntimeException("用户不存在"));
        return Result.success(responseRepository.findByUserId(user.getId()));
    }

    @GetMapping("/{id}/stats")
    public Result<Object> getStats(@PathVariable Long id, @RequestAttribute String openid) {
        User user = userRepository.findByOpenid(openid).orElseThrow(() -> new RuntimeException("用户不存在"));
        Survey survey = surveyRepository.findById(id).orElseThrow(() -> new RuntimeException("问卷不存在"));

        if (!survey.getOwnerId().equals(user.getId())) {
            return Result.error(403, "只有发布者才能查看统计");
        }

        List<Response> responses = responseRepository.findBySurveyId(id);

        long validCount = responses.stream().filter(r -> "valid".equals(r.getStatus())).count();
        long invalidCount = responses.stream().filter(r -> "invalid".equals(r.getStatus())).count();
        long incompleteCount = responses.stream().filter(r -> "incomplete".equals(r.getStatus())).count();

        Map<String, Object> stats = new HashMap<>();
        stats.put("surveyTitle", survey.getTitle());
        stats.put("totalCollected", responses.size());
        stats.put("validCount", validCount);
        stats.put("invalidCount", invalidCount);
        stats.put("incompleteCount", incompleteCount);

        return Result.success(stats);
    }
}
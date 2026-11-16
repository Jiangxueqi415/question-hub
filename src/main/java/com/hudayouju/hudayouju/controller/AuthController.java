package com.hudayouju.hudayouju.controller;

import com.hudayouju.hudayouju.common.Result;
import com.hudayouju.hudayouju.model.User;
import com.hudayouju.hudayouju.repository.CreditLedgerRepository;
import com.hudayouju.hudayouju.repository.PointLedgerRepository;
import com.hudayouju.hudayouju.repository.UserRepository;
import com.hudayouju.hudayouju.util.HashUtil;
import com.hudayouju.hudayouju.util.JwtUtil;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserRepository userRepository;
    private final PointLedgerRepository pointLedgerRepository;
    private final CreditLedgerRepository creditLedgerRepository;

    public AuthController(UserRepository userRepository,
                          PointLedgerRepository pointLedgerRepository,
                          CreditLedgerRepository creditLedgerRepository) {
        this.userRepository = userRepository;
        this.pointLedgerRepository = pointLedgerRepository;
        this.creditLedgerRepository = creditLedgerRepository;
    }

    // 1. 登录
    @PostMapping("/login")
    public Result<Object> login(@RequestBody Map<String, String> body) {
        String openid = body.getOrDefault("mockOpenid", "mock_openid_123");
        var optionalUser = userRepository.findByOpenid(openid);

        if (optionalUser.isPresent()) {
            User user = optionalUser.get();
            String token = JwtUtil.generate(user.getId(), user.getOpenid());
            Map<String, Object> data = new HashMap<>();
            data.put("token", token);
            data.put("user", user);
            data.put("needBind", false);
            return Result.success(data);
        } else {
            Map<String, Object> data = new HashMap<>();
            data.put("needBind", true);
            data.put("openid", openid);
            return Result.success(data);
        }
    }

    // 2. 绑定学号
    @PostMapping("/bind")
    public Result<Object> bind(@RequestBody Map<String, String> body) {
        String openid = body.get("openid");
        String studentNo = body.get("studentNo");
        String nickname = body.get("nickname");

        if (openid == null || studentNo == null || nickname == null) {
            return Result.error(400, "参数不完整");
        }

        String studentHash = HashUtil.hashStudentNo(studentNo);
        if (userRepository.findByStudentHash(studentHash).isPresent()) {
            return Result.error(400, "该学号已被其他微信绑定");
        }

        User newUser = new User();
        newUser.setOpenid(openid);
        newUser.setStudentHash(studentHash);
        newUser.setNickname(nickname);
        newUser.setPoints(0);
        newUser.setCredit(0);
        newUser.setOnboarded(true);
        userRepository.save(newUser);

        String token = JwtUtil.generate(newUser.getId(), newUser.getOpenid());
        Map<String, Object> data = new HashMap<>();
        data.put("token", token);
        data.put("user", newUser);
        return Result.success(data);
    }

    // 3. 查个人流水
    @GetMapping("/ledger")
    public Result<Object> getLedger(@RequestHeader(value = "Authorization", required = false) String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return Result.error(401, "未提供 Token 或格式错误");
        }

        try {
            String token = authHeader.substring(7);
            String openid = JwtUtil.verify(token);
            User user = userRepository.findByOpenid(openid).orElseThrow(() -> new RuntimeException("用户不存在"));

            Map<String, Object> data = new HashMap<>();
            data.put("points", user.getPoints());
            data.put("credit", user.getCredit());
            data.put("pointLedgers", pointLedgerRepository.findByUserIdOrderByCreatedAtDesc(user.getId()));
            data.put("creditLedgers", creditLedgerRepository.findByUserIdOrderByCreatedAtDesc(user.getId()));
            return Result.success(data);
        } catch (Exception e) {
            return Result.error(401, "Token 无效或已过期");
        }
    }

    // 4. 🔥 领新人任务 (+40 信誉)
    @PostMapping("/onboard")
    public Result<Object> onboard(@RequestAttribute String openid) {
        User user = userRepository.findByOpenid(openid).orElseThrow(() -> new RuntimeException("用户不存在"));

        if (user.getCredit() > 0) {
            return Result.error(400, "已经领取过新人任务啦");
        }

        user.setCredit(user.getCredit() + 40);
        userRepository.save(user);

        Map<String, Object> data = new HashMap<>();
        data.put("user", user);
        data.put("creditDelta", 40);
        data.put("already", false);
        return Result.success(data);
    }

    // 5.修改昵称
    @PatchMapping("/me")
    public Result<Object> updateNickname(@RequestBody Map<String, String> body, @RequestAttribute String openid) {
        User user = userRepository.findByOpenid(openid).orElseThrow(() -> new RuntimeException("用户不存在"));
        String newNickname = body.get("nickname");

        if (newNickname == null || newNickname.trim().length() < 2) {
            return Result.error(400, "昵称不能少于2个字");
        }

        user.setNickname(newNickname);
        userRepository.save(user);

        Map<String, Object> data = new HashMap<>();
        data.put("user", user);
        return Result.success(data);
    }
}
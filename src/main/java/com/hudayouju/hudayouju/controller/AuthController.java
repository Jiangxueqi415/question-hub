package com.hudayouju.hudayouju.controller;

import com.hudayouju.hudayouju.common.Result;
import com.hudayouju.hudayouju.model.User;
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

    public AuthController(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @PostMapping("/login")
    public Result<Object> login(@RequestBody Map<String, String> body) {
        System.out.println("========== 进来了 login 接口 ==========");
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

    @PostMapping("/bind")
    public Result<Object> bind(@RequestBody Map<String, String> body) {
        System.out.println("========== 进来了 bind 接口 ==========");

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
}
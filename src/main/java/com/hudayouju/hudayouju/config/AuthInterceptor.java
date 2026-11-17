package com.hudayouju.hudayouju.config;

import com.hudayouju.hudayouju.util.JwtUtil;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class AuthInterceptor implements HandlerInterceptor {

    // 🔥 S-10 修复：简易内存限流（防止脚本狂刷）
    private final Map<String, Long> lastRequestTime = new ConcurrentHashMap<>();

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) return true;

        // 限流控制：同一个 IP 300 毫秒内只能请求 1 次
        String ip = request.getRemoteAddr();
        long now = System.currentTimeMillis();
        Long lastTime = lastRequestTime.get(ip);
        if (lastTime != null && now - lastTime < 300) {
            response.setStatus(429);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"code\": 429, \"message\": \"操作太频繁，请稍后再试\"}");
            return false;
        }
        lastRequestTime.put(ip, now);

        // 下面的 Token 校验
        String authHeader = request.getHeader("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            response.setStatus(401);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"error\":\"请先登录，没有通行证不能进！\"}");
            return false;
        }
        try {
            String token = authHeader.substring(7);
            String openid = JwtUtil.verify(token);
            request.setAttribute("openid", openid);
            return true;
        } catch (Exception e) {
            response.setStatus(401);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"error\":\"通行证无效或已过期\"}");
            return false;
        }
    }
}
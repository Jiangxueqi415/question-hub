package com.hudayouju.hudayouju.config;

import com.hudayouju.hudayouju.util.JwtUtil;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
public class AuthInterceptor implements HandlerInterceptor {

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        // 1. 浏览器跨域时的 OPTIONS 预检请求，直接放行
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }

        // 2. 从请求头获取 Token
        String authHeader = request.getHeader("Authorization");

        // 3. 如果没带，或者不是 Bearer 开头，直接打回 401
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            response.setStatus(401);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"code\": 401, \"message\": \"请先登录，缺少通行证\"}");
            return false;
        }

        try {
            // 4. 验签（如果是伪造的 Token 会报错）
            String token = authHeader.substring(7);
            String openid = JwtUtil.verify(token);

            // 把 openid 存入 request，后面 Controller 可能会用到
            request.setAttribute("openid", openid);
            return true; // 放行
        } catch (Exception e) {
            response.setStatus(401);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"code\": 401, \"message\": \"通行证无效或已过期\"}");
            return false;
        }
    }
}
package com.hudayouju.hudayouju.util;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

public class JwtUtil {
    // 32位以上的密钥
    private static final SecretKey KEY = Keys.hmacShaKeyFor(
            "Hudayouju_Secret_Key_For_Team_Project_2026".getBytes(StandardCharsets.UTF_8));

    // 7天有效期
    private static final long EXPIRE_MS = 7 * 24 * 60 * 60 * 1000L;

    public static String generate(Long userId, String openid) {
        return Jwts.builder()
                .subject(openid)
                .claim("uid", userId)
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + EXPIRE_MS))
                .signWith(KEY)
                .compact();
    }

    public static String verify(String token) {
        return Jwts.parser().verifyWith(KEY).build()
                .parseSignedClaims(token).getPayload().getSubject();
    }
}
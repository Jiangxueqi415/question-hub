package com.hudayouju.hudayouju.util;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;

public class HashUtil {
    private static final String SALT = "Hudayouju_Salt_2026"; // 盐值（实际放环境变量）

    // 计算学号的 HMAC-SHA256 哈希
    public static String hashStudentNo(String studentNo) {
        try {
            Mac sha256_HMAC = Mac.getInstance("HmacSHA256");
            SecretKeySpec secret_key = new SecretKeySpec(SALT.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            sha256_HMAC.init(secret_key);
            byte[] hash = sha256_HMAC.doFinal(studentNo.getBytes(StandardCharsets.UTF_8));

            // 转成十六进制字符串
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (Exception e) {
            throw new RuntimeException("哈希计算失败", e);
        }
    }
}
package com.hudayouju.hudayouju.repository;

import com.hudayouju.hudayouju.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {
    // 根据微信的 openid 找用户
    Optional<User> findByOpenid(String openid);

    // 根据学号哈希找用户（防止同一学号被多个微信绑定）
    Optional<User> findByStudentHash(String studentHash);
}
package com.hudayouju.hudayouju.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "users")
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true)
    private String openid; // 微信唯一标识

    @Column(unique = true)
    private String studentHash; // 学号哈希

    private String nickname;
    private Integer points = 0; // 积分
    private Integer credit = 0; // 信誉
    private Boolean onboarded = false; // 是否已绑定学号

    private LocalDateTime createdAt = LocalDateTime.now();

    public User() {}

    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getOpenid() { return openid; }
    public void setOpenid(String openid) { this.openid = openid; }
    public String getStudentHash() { return studentHash; }
    public void setStudentHash(String studentHash) { this.studentHash = studentHash; }
    public String getNickname() { return nickname; }
    public void setNickname(String nickname) { this.nickname = nickname; }
    public Integer getPoints() { return points; }
    public void setPoints(Integer points) { this.points = points; }
    public Integer getCredit() { return credit; }
    public void setCredit(Integer credit) { this.credit = credit; }
    public Boolean getOnboarded() { return onboarded; }
    public void setOnboarded(Boolean onboarded) { this.onboarded = onboarded; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
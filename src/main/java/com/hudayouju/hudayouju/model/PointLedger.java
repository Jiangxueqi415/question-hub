package com.hudayouju.hudayouju.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "point_ledger")
public class PointLedger {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long userId;
    private Integer delta; // 变动值（加5或减10）
    private String reason; // 原因（如：发布问卷、完成问卷）
    private Long surveyId; // 关联的问卷ID
    private Integer balanceAfter; // 变动后余额
    private LocalDateTime createdAt = LocalDateTime.now();

    public PointLedger() {}

    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public Integer getDelta() { return delta; }
    public void setDelta(Integer delta) { this.delta = delta; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
    public Long getSurveyId() { return surveyId; }
    public void setSurveyId(Long surveyId) { this.surveyId = surveyId; }
    public Integer getBalanceAfter() { return balanceAfter; }
    public void setBalanceAfter(Integer balanceAfter) { this.balanceAfter = balanceAfter; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
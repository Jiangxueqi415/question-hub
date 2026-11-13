package com.hudayouju.hudayouju.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "responses")
public class Response {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long surveyId;
    private Long userId;

    @Column(columnDefinition = "TEXT")
    private String answersJson;

    private String flagsJson;
    private String status;
    private LocalDateTime createdAt = LocalDateTime.now();

    // 省略 getter/setter，IDEA 可以用 Alt+Insert 一键生成（如果没有红字的话）
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getSurveyId() { return surveyId; }
    public void setSurveyId(Long surveyId) { this.surveyId = surveyId; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public String getAnswersJson() { return answersJson; }
    public void setAnswersJson(String answersJson) { this.answersJson = answersJson; }
    public String getFlagsJson() { return flagsJson; }
    public void setFlagsJson(String flagsJson) { this.flagsJson = flagsJson; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
package com.hudayouju.hudayouju.repository;

import com.hudayouju.hudayouju.model.Response;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface ResponseRepository extends JpaRepository<Response, Long> {
    // 防重复提交的查询
    Optional<Response> findBySurveyIdAndUserId(Long surveyId, Long userId);

    // 查“我填写的”问卷列表
    List<Response> findByUserId(Long userId);

    // 查某份问卷收到的所有答卷（用于统计）
    List<Response> findBySurveyId(Long surveyId);
}
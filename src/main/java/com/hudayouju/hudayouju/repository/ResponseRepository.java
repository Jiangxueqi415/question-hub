package com.hudayouju.hudayouju.repository;

import com.hudayouju.hudayouju.model.Response;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface ResponseRepository extends JpaRepository<Response, Long> {
    Optional<Response> findBySurveyIdAndUserId(Long surveyId, Long userId);
}
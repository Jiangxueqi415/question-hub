package com.hudayouju.hudayouju.repository;

import com.hudayouju.hudayouju.model.Survey;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SurveyRepository extends JpaRepository<Survey, Long> {
}
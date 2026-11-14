package com.hudayouju.hudayouju.repository;

import com.hudayouju.hudayouju.model.Survey;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface SurveyRepository extends JpaRepository<Survey, Long> {
    // 根据 ownerId 查我发布的问卷
    List<Survey> findByOwnerId(Long ownerId);
}
package com.hudayouju.hudayouju.repository;

import com.hudayouju.hudayouju.model.PointLedger;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface PointLedgerRepository extends JpaRepository<PointLedger, Long> {
    // 按照时间倒序查询某个用户的流水
    List<PointLedger> findByUserIdOrderByCreatedAtDesc(Long userId);
}
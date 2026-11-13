package com.hudayouju.hudayouju.repository;

import com.hudayouju.hudayouju.model.CreditLedger;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface CreditLedgerRepository extends JpaRepository<CreditLedger, Long> {
    List<CreditLedger> findByUserIdOrderByCreatedAtDesc(Long userId);
}
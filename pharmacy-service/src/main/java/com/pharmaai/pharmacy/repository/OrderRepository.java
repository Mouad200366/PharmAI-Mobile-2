package com.pharmaai.pharmacy.repository;

import com.pharmaai.pharmacy.entity.Order;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.OffsetDateTime;
import java.util.List;

public interface OrderRepository extends JpaRepository<Order, Long> {

    List<Order> findByPharmacyIdOrderByCreatedAtDesc(Long pharmacyId);

    List<Order> findByPharmacyIdAndCreatedAtAfterOrderByCreatedAtDesc(
            Long pharmacyId,
            OffsetDateTime date
    );
}
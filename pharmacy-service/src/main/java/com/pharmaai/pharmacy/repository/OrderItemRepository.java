package com.pharmaai.pharmacy.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.pharmaai.pharmacy.entity.OrderItem;

@Repository
public interface OrderItemRepository extends JpaRepository<OrderItem, Long> {

    Optional<OrderItem> findByOrder_IdAndMedicine_Id(
            Long orderId,
            Long medicineId
    );

    List<OrderItem> findByOrder_Id(Long orderId);
}
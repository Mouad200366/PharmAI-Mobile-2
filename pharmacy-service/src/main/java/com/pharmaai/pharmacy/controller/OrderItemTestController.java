package com.pharmaai.pharmacy.controller;


import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import com.pharmaai.pharmacy.repository.OrderItemRepository;

@RestController
public class OrderItemTestController {

    private final OrderItemRepository orderItemRepository;

    public OrderItemTestController(OrderItemRepository orderItemRepository) {
        this.orderItemRepository = orderItemRepository;
    }

    @GetMapping("/api/order-items/{id}/scan-status")
    public ResponseEntity<?> getScanStatus(@PathVariable Long id) {
        return orderItemRepository.findById(id)
                .map(item -> ResponseEntity.ok(Map.of(
                        "id", item.getId(),
                        "quantity", item.getQuantity(),
                        "scannedQuantity", item.getScannedQuantity()
                )))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}

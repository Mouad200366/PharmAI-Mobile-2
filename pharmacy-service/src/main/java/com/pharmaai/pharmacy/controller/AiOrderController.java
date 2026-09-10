package com.pharmaai.pharmacy.controller;

import com.pharmaai.pharmacy.dto.AIOrderAssistantRequest;
import com.pharmaai.pharmacy.service.AiOrderService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/ai/orders")
public class AiOrderController {

    private final AiOrderService aiOrderService;

    public AiOrderController(AiOrderService aiOrderService) {
        this.aiOrderService = aiOrderService;
    }

    @PostMapping("/{pharmacyId}/ask")
    public String askAboutOrders(
            @PathVariable Long pharmacyId,
            @RequestBody AIOrderAssistantRequest request
    ) {

        return aiOrderService.analyzeOrders(
                pharmacyId,
                request.getQuestion()
        );
    }
}
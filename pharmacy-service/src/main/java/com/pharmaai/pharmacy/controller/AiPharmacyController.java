package com.pharmaai.pharmacy.controller;

import com.pharmaai.pharmacy.dto.AIPharmacyAssistantRequest;
import com.pharmaai.pharmacy.service.AiPharmacyService;

import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/ai/pharmacy")
public class AiPharmacyController {

    private final AiPharmacyService aiPharmacyService;

    public AiPharmacyController(
            AiPharmacyService aiPharmacyService
    ) {
        this.aiPharmacyService = aiPharmacyService;
    }

    @PostMapping("/{pharmacyId}/ask")
    public String askPharmacyAssistant(
            @PathVariable Long pharmacyId,
            @RequestBody AIPharmacyAssistantRequest request
    ) {

        return aiPharmacyService.ask(
                pharmacyId,
                request.getQuestion()
        );
    }
}
package com.pharmaai.pharmacy.controller;

import com.pharmaai.pharmacy.dto.PharmacyResponse;
import com.pharmaai.pharmacy.service.PharmacyService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import com.pharmaai.pharmacy.dto.PharmacyUpdateRequest;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.PutMapping;
import java.util.List;

@RestController
@RequestMapping("/api/pharmacy")
public class PharmacyController {

    private final PharmacyService pharmacyService;

    public PharmacyController(PharmacyService pharmacyService) {
    	
        this.pharmacyService = pharmacyService;
    }

    @GetMapping("/{pharmacyId}")
    public PharmacyResponse getPharmacy(
            @PathVariable Long pharmacyId
    ) {
        return pharmacyService.getPharmacy(pharmacyId);
    }
    @GetMapping
    public List<PharmacyResponse> getAllPharmacies() {
        return pharmacyService.getAllPharmacies();
    }
    @PutMapping("/{pharmacyId}")
    public PharmacyResponse updatePharmacy(
            @PathVariable Long pharmacyId,
            @RequestBody PharmacyUpdateRequest request
    ) {
        return pharmacyService.updatePharmacy(pharmacyId, request);
    }
}
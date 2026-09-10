package com.pharmaai.pharmacy.service;

import com.pharmaai.pharmacy.dto.PharmacyResponse;
import com.pharmaai.pharmacy.entity.Pharmacy;
import com.pharmaai.pharmacy.repository.PharmacyRepository;
import org.springframework.stereotype.Service;
import com.pharmaai.pharmacy.dto.PharmacyUpdateRequest;
import java.util.List;
@Service
public class PharmacyService {

    private final PharmacyRepository pharmacyRepository;

    public PharmacyService(PharmacyRepository pharmacyRepository) {
        this.pharmacyRepository = pharmacyRepository;
    }	

    public PharmacyResponse getPharmacy(Long pharmacyId) {

        Pharmacy pharmacy = pharmacyRepository.findById(pharmacyId)
                .orElseThrow(() ->
                        new RuntimeException("Pharmacy not found: " + pharmacyId)
                );

        return new PharmacyResponse(
                pharmacy.getId(),
                pharmacy.getName(),
                pharmacy.getLicenseNumber(),
                pharmacy.getPhone(),
                pharmacy.getAddress(),
                pharmacy.isActive(),
                pharmacy.isVerified()
        );
    }
    public List<PharmacyResponse> getAllPharmacies() {

        return pharmacyRepository.findAll()
                .stream()
                .map(pharmacy -> new PharmacyResponse(
                        pharmacy.getId(),
                        pharmacy.getName(),
                        pharmacy.getLicenseNumber(),
                        pharmacy.getPhone(),
                        pharmacy.getAddress(),
                        pharmacy.isActive(),
                        pharmacy.isVerified()
                ))
                .toList();
    }
    public PharmacyResponse updatePharmacy(
            Long pharmacyId,
            PharmacyUpdateRequest request
    ) {

        Pharmacy pharmacy = pharmacyRepository.findById(pharmacyId)
                .orElseThrow(() ->
                        new RuntimeException("Pharmacy not found: " + pharmacyId)
                );

        pharmacy.setName(request.getName());
        pharmacy.setLicenseNumber(request.getLicenseNumber());
        pharmacy.setPhone(request.getPhone());
        pharmacy.setAddress(request.getAddress());

        pharmacy.setUpdatedAt(java.time.OffsetDateTime.now());

        Pharmacy savedPharmacy = pharmacyRepository.save(pharmacy);

        return new PharmacyResponse(
                savedPharmacy.getId(),
                savedPharmacy.getName(),
                savedPharmacy.getLicenseNumber(),
                savedPharmacy.getPhone(),
                savedPharmacy.getAddress(),
                savedPharmacy.isActive(),
                savedPharmacy.isVerified()
        );
    }
}
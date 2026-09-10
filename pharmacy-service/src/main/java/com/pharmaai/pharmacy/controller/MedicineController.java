package com.pharmaai.pharmacy.controller;

import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.pharmaai.pharmacy.entity.Medicine;
import com.pharmaai.pharmacy.repository.MedicineRepository;

@RestController
@RequestMapping("/api/medicines")
public class MedicineController {

    private final MedicineRepository medicineRepository;

    public MedicineController(MedicineRepository medicineRepository) {
        this.medicineRepository = medicineRepository;
    }

    @GetMapping("/barcode/{barcode}")
    public ResponseEntity<?> findByBarcode(@PathVariable String barcode) {
        return medicineRepository.findByBarcode(barcode)
                .map(medicine -> ResponseEntity.ok(Map.of(
                        "id", medicine.getId(),
                        "name", medicine.getName(),
                        "barcode", medicine.getBarcode()
                )))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}

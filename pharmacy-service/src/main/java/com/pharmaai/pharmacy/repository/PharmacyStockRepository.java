package com.pharmaai.pharmacy.repository;

import com.pharmaai.pharmacy.entity.PharmacyStock;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PharmacyStockRepository extends JpaRepository<PharmacyStock, Long> {

    List<PharmacyStock> findByPharmacyId(Long pharmacyId);
}
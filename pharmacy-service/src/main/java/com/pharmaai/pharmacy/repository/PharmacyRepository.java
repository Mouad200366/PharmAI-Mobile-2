package com.pharmaai.pharmacy.repository;

import com.pharmaai.pharmacy.entity.Pharmacy;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface PharmacyRepository extends JpaRepository<Pharmacy, Long> {

    Optional<Pharmacy> findByOwnerId(Long ownerId);
}
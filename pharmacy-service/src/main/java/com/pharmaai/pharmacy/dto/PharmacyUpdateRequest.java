package com.pharmaai.pharmacy.dto;

public class PharmacyUpdateRequest {

    private String name;
    private String licenseNumber;
    private String phone;
    private String address;

    public PharmacyUpdateRequest() {
    }

    // ===== NAME =====

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    // ===== LICENSE NUMBER =====

    public String getLicenseNumber() {
        return licenseNumber;
    }

    public void setLicenseNumber(String licenseNumber) {
        this.licenseNumber = licenseNumber;
    }

    // ===== PHONE =====

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    // ===== ADDRESS =====

    public String getAddress() {
        return address;
    }

    public void setAddress(String address) {
        this.address = address;
    }
}
package com.pharmaai.pharmacy.dto;

public class PharmacyResponse {

    private Long id;
    private String name;
    private String licenseNumber;
    private String phone;
    private String address;
    private boolean active;
    private boolean verified;

    public PharmacyResponse(
            Long id,
            String name,
            String licenseNumber,
            String phone,
            String address,
            boolean active,
            boolean verified
    ) {
        this.id = id;
        this.name = name;
        this.licenseNumber = licenseNumber;
        this.phone = phone;
        this.address = address;
        this.active = active;
        this.verified = verified;
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getLicenseNumber() {
        return licenseNumber;
    }

    public String getPhone() {
        return phone;
    }

    public String getAddress() {
        return address;
    }

    public boolean isActive() {
        return active;
    }

    public boolean isVerified() {
        return verified;
    }
}
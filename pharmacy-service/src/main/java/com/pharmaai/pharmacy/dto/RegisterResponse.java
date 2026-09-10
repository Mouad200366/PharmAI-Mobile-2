package com.pharmaai.pharmacy.dto;

public class RegisterResponse {

    private Long userId;
    private Long pharmacyId;
    private String firstName;
    private String lastName;
    private String email;
    private String role;

    public RegisterResponse(
            Long userId,
            Long pharmacyId,
            String firstName,
            String lastName,
            String email,
            String role
    ) {
        this.userId = userId;
        this.pharmacyId = pharmacyId;
        this.firstName = firstName;
        this.lastName = lastName;
        this.email = email;
        this.role = role;
    }

    public Long getUserId() {
        return userId;
    }

    public Long getPharmacyId() {
        return pharmacyId;
    }

    public String getFirstName() {
        return firstName;
    }

    public String getLastName() {
        return lastName;
    }

    public String getEmail() {
        return email;
    }

    public String getRole() {
        return role;
    }
}
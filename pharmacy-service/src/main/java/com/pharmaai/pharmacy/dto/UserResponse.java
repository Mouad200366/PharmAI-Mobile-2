package com.pharmaai.pharmacy.dto;

public class UserResponse {

    private Long id;
    private String firstName;
    private String lastName;
    private String email;

    public UserResponse(
            Long id,
            String firstName,
            String lastName,
            String email
    ) {
        this.id = id;
        this.firstName = firstName;
        this.lastName = lastName;
        this.email = email;
    }

    public Long getId() {
        return id;
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

    public String getFullName() {
        String first = firstName != null ? firstName : "";
        String last = lastName != null ? lastName : "";

        return (first + " " + last).trim();
    }
}
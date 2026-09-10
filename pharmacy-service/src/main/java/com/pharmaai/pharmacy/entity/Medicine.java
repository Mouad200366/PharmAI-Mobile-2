package com.pharmaai.pharmacy.entity;

import jakarta.persistence.*;


@Entity
@Table(name = "catalog_medicine")
public class Medicine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "name", nullable = false, length = 200)
    private String name;

    @Column(name = "generic_name", nullable = false, length = 200)
    private String genericName;

    @Column(name = "description", nullable = false)
    private String description;

    @Column(name = "manufacturer", nullable = false, length = 200)
    private String manufacturer;

    @Column(name = "requires_prescription", nullable = false)
    private boolean requiresPrescription;

    @Column(name = "image", length = 100)
    private String image;

    @Column(name = "is_active", nullable = false)
    private boolean active;
    
    @Column(name = "barcode", length = 64, unique = true)
    private String barcode;

    public Medicine() {
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getGenericName() {
        return genericName;
    }

    public void setGenericName(String genericName) {
        this.genericName = genericName;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getManufacturer() {
        return manufacturer;
    }

    public void setManufacturer(String manufacturer) {
        this.manufacturer = manufacturer;
    }

    public boolean isRequiresPrescription() {
        return requiresPrescription;
    }

    public void setRequiresPrescription(boolean requiresPrescription) {
        this.requiresPrescription = requiresPrescription;
    }

    public String getImage() {
        return image;
    }

    public void setImage(String image) {
        this.image = image;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }
    
    public String getBarcode() {
        return barcode;
    }

    public void setBarcode(String barcode) {
        this.barcode = barcode;
    }
}
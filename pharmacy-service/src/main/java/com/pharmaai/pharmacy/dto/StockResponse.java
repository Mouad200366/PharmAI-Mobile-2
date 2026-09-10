package com.pharmaai.pharmacy.dto;

import java.math.BigDecimal;

public class StockResponse {

    private Long id;
    private String medicineName;
    private Integer quantity;
    private BigDecimal price;
    private boolean available;
    private boolean requiresPrescription;

    public StockResponse() {
    }

    public StockResponse(
            Long id,
            String medicineName,
            Integer quantity,
            BigDecimal price,
            boolean available,
            boolean requiresPrescription
    ) {
        this.id = id;
        this.medicineName = medicineName;
        this.quantity = quantity;
        this.price = price;
        this.available = available;
        this.requiresPrescription = requiresPrescription;
    }

    public Long getId() {
        return id;
    }

    public String getMedicineName() {
        return medicineName;
    }

    public Integer getQuantity() {
        return quantity;
    }

    public BigDecimal getPrice() {
        return price;
    }

    public boolean isAvailable() {
        return available;
    }

    public boolean isRequiresPrescription() {
        return requiresPrescription;
    }
}
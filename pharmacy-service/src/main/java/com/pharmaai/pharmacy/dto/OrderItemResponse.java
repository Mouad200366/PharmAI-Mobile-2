package com.pharmaai.pharmacy.dto;

import java.math.BigDecimal;

public class OrderItemResponse {

    private Long id;
    private Long medicineId;
    private String medicineName;
    private Integer quantity;
    private Integer scannedQuantity;
    private BigDecimal unitPrice;

    public OrderItemResponse() {
    }

    public OrderItemResponse(
            Long id,
            Long medicineId,
            String medicineName,
            Integer quantity,
            Integer scannedQuantity,
            BigDecimal unitPrice
    ) {
        this.id = id;
        this.medicineId = medicineId;
        this.medicineName = medicineName;
        this.quantity = quantity;
        this.scannedQuantity = scannedQuantity;
        this.unitPrice = unitPrice;
    }

    public Long getId() {
        return id;
    }

    public Long getMedicineId() {
        return medicineId;
    }

    public String getMedicineName() {
        return medicineName;
    }

    public Integer getQuantity() {
        return quantity;
    }
    
    public Integer getScannedQuantity() {
        return scannedQuantity;
    }

    public BigDecimal getUnitPrice() {
        return unitPrice;
    }
}
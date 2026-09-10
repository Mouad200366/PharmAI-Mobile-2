package com.pharmaai.pharmacy.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

public class OrderResponse {

    private Long id;
    private OffsetDateTime createdAt;
    private String deliveryAddress;

    private BigDecimal itemsTotal;
    private BigDecimal deliveryFee;
    private BigDecimal grandTotal;

    private String status;
    private String prescriptionMode;
    private String paymentMethod;
    private String notes;

    private Long customerId;
    private String customerName;
    private Long pharmacyId;

    private List<OrderItemResponse> items;

    public OrderResponse() {
    }

    public OrderResponse(
            Long id,
            OffsetDateTime createdAt,
            String deliveryAddress,
            BigDecimal itemsTotal,
            BigDecimal deliveryFee,
            BigDecimal grandTotal,
            String status,
            String prescriptionMode,
            String paymentMethod,
            String notes,
            Long customerId,
            String customerName,
            Long pharmacyId,
            List<OrderItemResponse> items
    ) {
        this.id = id;
        this.createdAt = createdAt;
        this.deliveryAddress = deliveryAddress;
        this.itemsTotal = itemsTotal;
        this.deliveryFee = deliveryFee;
        this.grandTotal = grandTotal;
        this.status = status;
        this.prescriptionMode = prescriptionMode;
        this.paymentMethod = paymentMethod;
        this.notes = notes;
        this.customerId = customerId;
        this.customerName = customerName;
        this.pharmacyId = pharmacyId;
        this.items = items;
    }

    public Long getId() {
        return id;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public String getDeliveryAddress() {
        return deliveryAddress;
    }

    public BigDecimal getItemsTotal() {
        return itemsTotal;
    }

    public BigDecimal getDeliveryFee() {
        return deliveryFee;
    }

    public BigDecimal getGrandTotal() {
        return grandTotal;
    }

    public String getStatus() {
        return status;
    }

    public String getPrescriptionMode() {
        return prescriptionMode;
    }

    public String getPaymentMethod() {
        return paymentMethod;
    }

    public String getNotes() {
        return notes;
    }

    public Long getCustomerId() {
        return customerId;
    }
    
    public String getCustomerName() {
        return customerName;
    }

    public Long getPharmacyId() {
        return pharmacyId;
    }

    public List<OrderItemResponse> getItems() {
        return items;
    }
}
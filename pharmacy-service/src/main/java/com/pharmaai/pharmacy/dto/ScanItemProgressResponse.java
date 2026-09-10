package com.pharmaai.pharmacy.dto;

public class ScanItemProgressResponse {

    private Long orderItemId;
    private Long medicineId;
    private String medicineName;
    private Integer quantity;
    private Integer scannedQuantity;
    private boolean complete;

    public ScanItemProgressResponse(
            Long orderItemId,
            Long medicineId,
            String medicineName,
            Integer quantity,
            Integer scannedQuantity,
            boolean complete
    ) {
        this.orderItemId = orderItemId;
        this.medicineId = medicineId;
        this.medicineName = medicineName;
        this.quantity = quantity;
        this.scannedQuantity = scannedQuantity;
        this.complete = complete;
    }

    public Long getOrderItemId() {
        return orderItemId;
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

    public boolean isComplete() {
        return complete;
    }
}
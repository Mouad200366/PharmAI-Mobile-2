package com.pharmaai.pharmacy.dto;

import java.util.List;

public class ScanMedicineResponse {

    private boolean success;
    private String message;
    private Long orderId;
    private String orderStatus;

    private Long scannedMedicineId;
    private String scannedMedicineName;
    private String barcode;

    private ScanProgressResponse progress;
    private List<ScanItemProgressResponse> items;

    public ScanMedicineResponse(
            boolean success,
            String message,
            Long orderId,
            String orderStatus,
            Long scannedMedicineId,
            String scannedMedicineName,
            String barcode,
            ScanProgressResponse progress,
            List<ScanItemProgressResponse> items
    ) {
        this.success = success;
        this.message = message;
        this.orderId = orderId;
        this.orderStatus = orderStatus;
        this.scannedMedicineId = scannedMedicineId;
        this.scannedMedicineName = scannedMedicineName;
        this.barcode = barcode;
        this.progress = progress;
        this.items = items;
    }

    public boolean isSuccess() {
        return success;
    }

    public String getMessage() {
        return message;
    }

    public Long getOrderId() {
        return orderId;
    }

    public String getOrderStatus() {
        return orderStatus;
    }

    public Long getScannedMedicineId() {
        return scannedMedicineId;
    }

    public String getScannedMedicineName() {
        return scannedMedicineName;
    }

    public String getBarcode() {
        return barcode;
    }

    public ScanProgressResponse getProgress() {
        return progress;
    }

    public List<ScanItemProgressResponse> getItems() {
        return items;
    }
}
package com.pharmaai.pharmacy.dto;

public class ScanMedicineRequest {

    private String barcode;

    public ScanMedicineRequest() {
    }

    public String getBarcode() {
        return barcode;
    }

    public void setBarcode(String barcode) {
        this.barcode = barcode;
    }
}
package com.pharmaai.pharmacy.dto;

public class ScanProgressResponse {

    private int scanned;
    private int required;
    private int percentage;

    public ScanProgressResponse(
            int scanned,
            int required,
            int percentage
    ) {
        this.scanned = scanned;
        this.required = required;
        this.percentage = percentage;
    }

    public int getScanned() {
        return scanned;
    }

    public int getRequired() {
        return required;
    }

    public int getPercentage() {
        return percentage;
    }
}
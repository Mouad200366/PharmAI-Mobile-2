package com.pharmaai.pharmacy.dto;

public class StockPredictionDTO {

    private Long medicineId;
    private String medicineName;

    private Integer currentStock;
    private Double weeklyDemand;
    private Double weeksOfStock;

    private String alertType;
    private String alertMessage;

    private Integer recommendedQuantity;

    public StockPredictionDTO() {
    }

    public StockPredictionDTO(
            Long medicineId,
            String medicineName,
            Integer currentStock,
            Double weeklyDemand,
            Double weeksOfStock,
            String alertType,
            String alertMessage,
            Integer recommendedQuantity
    ) {
        this.medicineId = medicineId;
        this.medicineName = medicineName;
        this.currentStock = currentStock;
        this.weeklyDemand = weeklyDemand;
        this.weeksOfStock = weeksOfStock;
        this.alertType = alertType;
        this.alertMessage = alertMessage;
        this.recommendedQuantity = recommendedQuantity;
    }

    public Long getMedicineId() {
        return medicineId;
    }

    public void setMedicineId(Long medicineId) {
        this.medicineId = medicineId;
    }

    public String getMedicineName() {
        return medicineName;
    }

    public void setMedicineName(String medicineName) {
        this.medicineName = medicineName;
    }

    public Integer getCurrentStock() {
        return currentStock;
    }

    public void setCurrentStock(Integer currentStock) {
        this.currentStock = currentStock;
    }

    public Double getWeeklyDemand() {
        return weeklyDemand;
    }

    public void setWeeklyDemand(Double weeklyDemand) {
        this.weeklyDemand = weeklyDemand;
    }

    public Double getWeeksOfStock() {
        return weeksOfStock;
    }

    public void setWeeksOfStock(Double weeksOfStock) {
        this.weeksOfStock = weeksOfStock;
    }

    public String getAlertType() {
        return alertType;
    }

    public void setAlertType(String alertType) {
        this.alertType = alertType;
    }

    public String getAlertMessage() {
        return alertMessage;
    }

    public void setAlertMessage(String alertMessage) {
        this.alertMessage = alertMessage;
    }

    public Integer getRecommendedQuantity() {
        return recommendedQuantity;
    }

    public void setRecommendedQuantity(Integer recommendedQuantity) {
        this.recommendedQuantity = recommendedQuantity;
    }
}
package com.pharmaai.pharmacy.controller;

import com.pharmaai.pharmacy.dto.StockResponse;
import com.pharmaai.pharmacy.service.StockService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.PutMapping;
import com.pharmaai.pharmacy.dto.StockUpdateRequest;
import jakarta.validation.Valid;

import java.util.List;

@RestController
@RequestMapping("/api/pharmacy")
public class StockController {

    private final StockService stockService;

    public StockController(StockService stockService) {
        this.stockService = stockService;
    }

    @GetMapping("/{pharmacyId}/stock")
    public List<StockResponse> getStock(
            @PathVariable Long pharmacyId
    ) {
        return stockService.getStockForPharmacy(pharmacyId);
    }
    @PutMapping("/{pharmacyId}/stock/{stockId}")
    public StockResponse updateStock(
            @PathVariable Long pharmacyId,
            @PathVariable Long stockId,
            @Valid @RequestBody StockUpdateRequest request
    ) {
        return stockService.updateStock(
                pharmacyId,
                stockId,
                request
        );
    }
}
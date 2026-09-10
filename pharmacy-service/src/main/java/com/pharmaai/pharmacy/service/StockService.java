package com.pharmaai.pharmacy.service;

import com.pharmaai.pharmacy.dto.StockResponse;

import com.pharmaai.pharmacy.entity.PharmacyStock;
import com.pharmaai.pharmacy.repository.PharmacyStockRepository;
import org.springframework.stereotype.Service;
import com.pharmaai.pharmacy.dto.StockUpdateRequest;
import java.util.List;

@Service
public class StockService {

    private final PharmacyStockRepository stockRepository;

    public StockService(PharmacyStockRepository stockRepository) {
        this.stockRepository = stockRepository;
    }

    public List<StockResponse> getStockForPharmacy(Long pharmacyId) {

        List<PharmacyStock> stock =
                stockRepository.findByPharmacyId(pharmacyId);

        return stock.stream()
                .map(item -> new StockResponse(
                        item.getId(),
                        item.getMedicine().getName(),
                        item.getQuantity(),
                        item.getPrice(),
                        item.isAvailable(),
                        item.getMedicine().isRequiresPrescription()
                ))
                .toList();
    }
    public StockResponse updateStock(
            Long pharmacyId,
            Long stockId,
            StockUpdateRequest request
    ) {

        PharmacyStock stock = stockRepository
                .findById(stockId)
                .orElseThrow(() ->
                        new RuntimeException("Stock not found: " + stockId)
                );

        if (!stock.getPharmacy().getId().equals(pharmacyId)) {
            throw new RuntimeException("Stock does not belong to this pharmacy");
        }

     // Validate and update quantity
        if (request.getQuantity() != null) {

            System.out.println("DEBUG - Received quantity: " + request.getQuantity());

            if (request.getQuantity() < 0) {
                throw new IllegalArgumentException(
                        "Quantity cannot be negative"
                );
            }

            stock.setQuantity(request.getQuantity());
        }

        // Update price
        if (request.getPrice() != null) {
            stock.setPrice(request.getPrice());
        }

        // Update availability
        if (request.getAvailable() != null) {
            stock.setAvailable(request.getAvailable());
        }

        PharmacyStock savedStock = stockRepository.save(stock);

        return new StockResponse(
                savedStock.getId(),
                savedStock.getMedicine().getName(),
                savedStock.getQuantity(),
                savedStock.getPrice(),
                savedStock.isAvailable(),
                savedStock.getMedicine().isRequiresPrescription()
        );
    
    }
}
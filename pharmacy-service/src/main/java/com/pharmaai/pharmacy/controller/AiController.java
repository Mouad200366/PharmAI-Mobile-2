package com.pharmaai.pharmacy.controller;

import com.pharmaai.pharmacy.dto.StockPredictionDTO;
import com.pharmaai.pharmacy.service.AiService;
import com.pharmaai.pharmacy.service.StockPredictionService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/ai")
public class AiController {

    private final AiService aiService;
    private final StockPredictionService stockPredictionService;

    public AiController(
            AiService aiService,
            StockPredictionService stockPredictionService
    ) {
        this.aiService = aiService;
        this.stockPredictionService = stockPredictionService;
    }

    @GetMapping("/test")
    public String testAI() {
        return aiService.testOllama();
    }

    @GetMapping("/stock-analysis/{pharmacyId}")
    public String analyzeStock(
            @PathVariable Long pharmacyId
    ) {
        return aiService.analyzeStock(pharmacyId);
    }

    @GetMapping("/pharmacy/{pharmacyId}/stock-predictions")
    public List<StockPredictionDTO> predictStock(
            @PathVariable Long pharmacyId
    ) {
        return stockPredictionService.analyzeStock(pharmacyId);
    }
}
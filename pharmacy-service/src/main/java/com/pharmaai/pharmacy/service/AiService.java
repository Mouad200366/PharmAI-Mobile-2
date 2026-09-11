package com.pharmaai.pharmacy.service;

import java.util.List;
import java.util.Map;

import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import com.pharmaai.pharmacy.entity.PharmacyStock;
import com.pharmaai.pharmacy.repository.PharmacyStockRepository;

@Service
public class AiService {

    private final RestClient restClient;
    private final PharmacyStockRepository stockRepository;

    public AiService(PharmacyStockRepository stockRepository) {

        this.stockRepository = stockRepository;

        this.restClient = RestClient.builder()
                .baseUrl(System.getenv().getOrDefault(
        "OLLAMA_BASE_URL",
        "http://localhost:11434"
))
                .build();
    }

    public String testOllama() {

        Map<String, Object> request = Map.of(
                "model", "qwen2.5:7b",
                "prompt",
                "Tu es l'assistant IA de PharmaAI. Réponds en français. "
                + "Dis simplement bonjour au pharmacien.",
                "stream", false
        );

        Map<?, ?> response = restClient.post()
                .uri("/api/generate")
                .contentType(MediaType.APPLICATION_JSON)
                .body(request)
                .retrieve()
                .body(Map.class);

        if (response == null || response.get("response") == null) {
            throw new RuntimeException(
                    "Ollama n'a retourné aucune réponse."
            );
        }

        return response.get("response").toString();
    }

public String analyzeStock(Long pharmacyId) {

    List<PharmacyStock> stock =
            stockRepository.findByPharmacyId(pharmacyId);

    if (stock.isEmpty()) {
        return "Aucun stock trouvé pour cette pharmacie.";
    }

    StringBuilder outOfStock = new StringBuilder();
    StringBuilder lowStock = new StringBuilder();
    StringBuilder unavailable = new StringBuilder();
    StringBuilder recommendations = new StringBuilder();

    for (PharmacyStock item : stock) {

        int quantity = item.getQuantity();
        String name = item.getMedicine().getName();

        if (quantity == 0) {
            outOfStock.append("- **")
                    .append(name)
                    .append("** : Quantité = 0 unité\n");

            recommendations.append("- **")
                    .append(name)
                    .append("** : réapprovisionnement prioritaire, le médicament est en rupture.\n");

        } else if (quantity < 5) {
            lowStock.append("- **")
                    .append(name)
                    .append("** : Quantité = ")
                    .append(quantity)
                    .append(" unités\n");

            recommendations.append("- **")
                    .append(name)
                    .append("** : stock faible (")
                    .append(quantity)
                    .append(" unités), réapprovisionnement recommandé.\n");
        }

        if (!item.isAvailable()) {
            unavailable.append("- **")
                    .append(name)
                    .append("**\n");
        }
    }

    StringBuilder result = new StringBuilder();

    result.append("### Analyse du stock\n\n");

    result.append("#### Médicaments en rupture\n\n");

    if (outOfStock.isEmpty()) {
        result.append("Aucun médicament en rupture.\n");
    } else {
        result.append(outOfStock);
    }

    result.append("\n#### Médicaments avec un stock faible (< 5 unités)\n\n");

    if (lowStock.isEmpty()) {
        result.append("Aucun médicament avec un stock faible.\n");
    } else {
        result.append(lowStock);
    }

    result.append("\n#### Médicaments marqués comme non disponibles\n\n");

    if (unavailable.isEmpty()) {
        result.append("Aucun médicament marqué comme non disponible.\n");
    } else {
        result.append(unavailable);
    }

    result.append("\n### Recommandations de réapprovisionnement\n\n");

    if (recommendations.isEmpty()) {
        result.append("Aucun réapprovisionnement urgent détecté.\n");
    } else {
        result.append(recommendations);
    }

    result.append(
            "\nLes classifications sont calculées automatiquement à partir des quantités réelles du stock."
    );

    return result.toString();
}
}
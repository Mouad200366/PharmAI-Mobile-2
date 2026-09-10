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

        StringBuilder stockData = new StringBuilder();

        stockData.append(
                "Voici les données réelles du stock de la pharmacie.\n\n"
        );

        for (PharmacyStock item : stock) {

            stockData.append("- Médicament : ")
                    .append(item.getMedicine().getName())
                    .append("\n");

            stockData.append("  Nom générique : ")
                    .append(item.getMedicine().getGenericName())
                    .append("\n");

            stockData.append("  Fabricant : ")
                    .append(item.getMedicine().getManufacturer())
                    .append("\n");

            stockData.append("  Quantité : ")
                    .append(item.getQuantity())
                    .append(" unités\n");

            stockData.append("  Disponible : ")
                    .append(item.isAvailable() ? "Oui" : "Non")
                    .append("\n");

            stockData.append("  Ordonnance requise : ")
                    .append(
                            item.getMedicine().isRequiresPrescription()
                                    ? "Oui"
                                    : "Non"
                    )
                    .append("\n\n");
        }

        String prompt = """
                Tu es l'assistant IA de PharmaAI destiné à un pharmacien.

                Analyse UNIQUEMENT les données réelles du stock fournies ci-dessous.

                Règles importantes :
                - Réponds uniquement en français.
                - N'invente aucune donnée.
                - Utilise uniquement les médicaments présents dans les données.
                - Utilise uniquement les quantités présentes dans les données.
                - Identifie les médicaments en rupture lorsque la quantité est exactement 0.
                - Identifie les médicaments avec un stock faible uniquement lorsque
                  la quantité est strictement inférieure à 5 unités.
                - Une quantité de 5 unités ou plus n'est PAS un stock faible.
                - Signale les médicaments marqués comme non disponibles.
                - Donne des recommandations simples de réapprovisionnement.
                - Ne donne aucun conseil médical.
                - Le pharmacien reste responsable de la décision finale.

                IMPORTANT POUR LES QUESTIONS SUR LE STOCK :
                Si le pharmacien demande quels médicaments ont un stock faible,
                retourne uniquement les médicaments dont la quantité est < 5.

                Si le pharmacien demande quels médicaments sont en rupture,
                retourne uniquement les médicaments dont la quantité est = 0.

                Ne considère jamais une quantité comme faible sans vérifier
                la quantité exacte fournie dans les données.

                Données du stock :

                """ + stockData;

        Map<String, Object> request = Map.of(
                "model", "qwen2.5:7b",
                "prompt", prompt,
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
                    "Ollama n'a retourné aucune analyse."
            );
        }

        return response.get("response").toString();
    }
}
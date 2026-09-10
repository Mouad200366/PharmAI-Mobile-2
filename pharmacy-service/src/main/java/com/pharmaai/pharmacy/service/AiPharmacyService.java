package com.pharmaai.pharmacy.service;

import com.pharmaai.pharmacy.entity.Order;
import com.pharmaai.pharmacy.entity.OrderItem;
import com.pharmaai.pharmacy.entity.PharmacyStock;
import com.pharmaai.pharmacy.repository.OrderRepository;
import com.pharmaai.pharmacy.repository.PharmacyStockRepository;

import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class AiPharmacyService {

    private final PharmacyStockRepository stockRepository;
    private final OrderRepository orderRepository;
    private final OllamaService ollamaService;

    public AiPharmacyService(
            PharmacyStockRepository stockRepository,
            OrderRepository orderRepository,
            OllamaService ollamaService
    ) {
        this.stockRepository = stockRepository;
        this.orderRepository = orderRepository;
        this.ollamaService = ollamaService;
    }

    public String ask(Long pharmacyId, String question) {

        List<PharmacyStock> stock =
                stockRepository.findByPharmacyId(pharmacyId);

        List<Order> orders =
                orderRepository
                        .findByPharmacyIdOrderByCreatedAtDesc(pharmacyId);

        if (stock.isEmpty() && orders.isEmpty()) {
            return "Aucune donnée disponible pour cette pharmacie.";
        }

        StringBuilder data = new StringBuilder();

        // =========================
        // STOCK
        // =========================

        data.append("=== STOCK DE LA PHARMACIE ===\n\n");

        for (PharmacyStock item : stock) {

            data.append("Médicament : ")
                    .append(item.getMedicine().getName())
                    .append("\n");

            data.append("Nom générique : ")
                    .append(item.getMedicine().getGenericName())
                    .append("\n");

            data.append("Fabricant : ")
                    .append(item.getMedicine().getManufacturer())
                    .append("\n");

            data.append("Quantité : ")
                    .append(item.getQuantity())
                    .append("\n");

            data.append("Disponible : ")
                    .append(item.isAvailable() ? "Oui" : "Non")
                    .append("\n");

            data.append("Ordonnance requise : ")
                    .append(
                            item.getMedicine().isRequiresPrescription()
                                    ? "Oui"
                                    : "Non"
                    )
                    .append("\n\n");
        }

        // =========================
        // COMMANDES
        // =========================

        data.append("=== COMMANDES ===\n\n");

        for (Order order : orders) {

            data.append("Commande #")
                    .append(order.getId())
                    .append("\n");

            data.append("Date : ")
                    .append(order.getCreatedAt())
                    .append("\n");

            data.append("Statut : ")
                    .append(order.getStatus())
                    .append("\n");

            data.append("Total : ")
                    .append(order.getGrandTotal())
                    .append(" DH\n");

            data.append("Prescription : ")
                    .append(order.getPrescriptionMode())
                    .append("\n");

            data.append("Produits :\n");

            for (OrderItem item : order.getItems()) {

                data.append("- ")
                        .append(item.getMedicine().getName())
                        .append(" x")
                        .append(item.getQuantity())
                        .append("\n");
            }

            data.append("\n");
        }

        // =========================
        // PROMPT
        // =========================

        String prompt = """
                Tu es l'assistant intelligent de PharmaAI
                destiné à un pharmacien.

                Tu dois répondre à la question du pharmacien
                en utilisant UNIQUEMENT les données fournies.

                RÈGLES :

                - Réponds uniquement en français.
                - N'invente aucune donnée.
                - Ne suppose aucune information absente.
                - Si l'information demandée n'existe pas dans les données,
                  indique-le clairement.
                - Sois clair et concis.
                - Utilise des listes lorsque cela améliore la lisibilité.
                - Tu peux identifier des tendances simples dans les données.
                - Tu peux signaler les stocks faibles.
                - Tu peux signaler les ruptures de stock.
                - Tu peux signaler les commandes importantes ou en attente.
                - Ne donne jamais de diagnostic médical.
                - Le pharmacien reste responsable de la décision finale.

                DONNÉES DE LA PHARMACIE :

                %s

                QUESTION DU PHARMACIEN :

                %s
                """.formatted(data, question);

        return ollamaService.generate(prompt);
    }
}
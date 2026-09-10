package com.pharmaai.pharmacy.service;

import com.pharmaai.pharmacy.entity.Order;
import com.pharmaai.pharmacy.entity.OrderItem;
import com.pharmaai.pharmacy.entity.PharmacyStock;
import com.pharmaai.pharmacy.repository.OrderRepository;
import com.pharmaai.pharmacy.repository.PharmacyStockRepository;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class AiOrderService {

    private final OrderRepository orderRepository;
    private final PharmacyStockRepository stockRepository;
    private final OllamaService ollamaService;

    public AiOrderService(
            OrderRepository orderRepository,
            PharmacyStockRepository stockRepository,
            OllamaService ollamaService
    ) {
        this.orderRepository = orderRepository;
        this.stockRepository = stockRepository;
        this.ollamaService = ollamaService;
    }

    @Transactional(readOnly = true)
    public String analyzeOrders(Long pharmacyId, String question) {

        // =========================================================
        // 1. GET ORDERS
        // =========================================================

        List<Order> orders =
                orderRepository.findByPharmacyIdOrderByCreatedAtDesc(pharmacyId);

        // =========================================================
        // 2. GET REAL PHARMACY STOCK
        // =========================================================

        List<PharmacyStock> stock =
                stockRepository.findByPharmacyId(pharmacyId);

        // =========================================================
        // 3. BUILD ORDERS DATA
        // =========================================================

        StringBuilder ordersData = new StringBuilder();

        ordersData.append(
                "DONNÉES RÉELLES DES COMMANDES DE LA PHARMACIE :\n\n"
        );

        if (orders.isEmpty()) {

            ordersData.append(
                    "Aucune commande n'est actuellement enregistrée "
                    + "pour cette pharmacie.\n\n"
            );

        } else {

            for (Order order : orders) {

                ordersData.append("Commande #")
                        .append(order.getId())
                        .append("\n");

                ordersData.append("Date : ")
                        .append(order.getCreatedAt())
                        .append("\n");

                ordersData.append("Statut : ")
                        .append(order.getStatus())
                        .append("\n");

                ordersData.append("Total : ")
                        .append(order.getGrandTotal())
                        .append(" DH\n");

                ordersData.append("Mode de paiement : ")
                        .append(order.getPaymentMethod())
                        .append("\n");

                ordersData.append("Prescription : ")
                        .append(order.getPrescriptionMode())
                        .append("\n");

                ordersData.append("Client : #")
                        .append(order.getCustomerId())
                        .append("\n");

                ordersData.append("Produits :\n");

                for (OrderItem item : order.getItems()) {

                    ordersData.append("- ")
                            .append(item.getMedicine().getName())
                            .append(" x")
                            .append(item.getQuantity())
                            .append(" à ")
                            .append(item.getUnitPrice())
                            .append(" DH\n");
                }

                ordersData.append("\n----------------------\n");
            }
        }

        // =========================================================
        // 4. BUILD REAL STOCK DATA
        // =========================================================

        StringBuilder stockData = new StringBuilder();

        stockData.append(
                "DONNÉES RÉELLES DU STOCK DE LA PHARMACIE :\n\n"
        );

        if (stock.isEmpty()) {

            stockData.append(
                    "Aucune donnée de stock n'est disponible "
                    + "pour cette pharmacie.\n\n"
            );

        } else {

            for (PharmacyStock item : stock) {

                stockData.append("Médicament : ")
                        .append(item.getMedicine().getName())
                        .append("\n");

                stockData.append("Nom générique : ")
                        .append(item.getMedicine().getGenericName())
                        .append("\n");

                stockData.append("Fabricant : ")
                        .append(item.getMedicine().getManufacturer())
                        .append("\n");

                stockData.append("Quantité : ")
                        .append(item.getQuantity())
                        .append(" unités\n");

                stockData.append("Disponible : ")
                        .append(item.isAvailable() ? "Oui" : "Non")
                        .append("\n");

                stockData.append("Ordonnance requise : ")
                        .append(
                                item.getMedicine().isRequiresPrescription()
                                        ? "Oui"
                                        : "Non"
                        )
                        .append("\n");

                stockData.append("\n----------------------\n");
            }
        }

        // =========================================================
        // 5. BUILD AI PROMPT
        // =========================================================

        String prompt = """
                Tu es l'assistant intelligent de PharmaAI destiné à un pharmacien.

                Ta mission est d'analyser les données RÉELLES fournies par
                le système concernant les commandes et le stock.

                =========================================================
                RÈGLES ABSOLUES
                =========================================================

                1. Réponds uniquement en français.

                2. Utilise uniquement les données fournies dans ce prompt.

                3. N'invente aucune donnée.

                4. Ne déduis JAMAIS l'état du stock à partir des commandes.

                5. Pour déterminer l'état du stock, utilise UNIQUEMENT
                   les données de la section STOCK.

                6. Une quantité de 0 signifie :
                   "Rupture de stock".

                7. Une quantité supérieure à 0 et inférieure ou égale à 5
                   signifie :
                   "Stock faible".

                8. Si "Disponible" est "Non", indique que le médicament
                   est actuellement marqué comme non disponible.

                9. Le statut "ready_for_pickup" signifie uniquement :
                   "Commande prête à être récupérée".
                   Cela ne signifie PAS que la commande est urgente.

                10. Un montant élevé ne signifie PAS automatiquement
                    qu'une commande est urgente.

                11. Ne donne aucun conseil médical.

                12. Ne déduis pas qu'un médicament nécessite une surveillance
                    médicale simplement à cause de son nom.

                13. Si les données ne permettent pas de répondre à une question,
                    indique clairement que les données disponibles ne permettent
                    pas de répondre.

                14. Le pharmacien reste responsable de la décision finale.

                =========================================================
                DONNÉES DES COMMANDES
                =========================================================

                %s

                =========================================================
                DONNÉES DU STOCK
                =========================================================

                %s

                =========================================================
                QUESTION DU PHARMACIEN
                =========================================================

                %s

                =========================================================
                INSTRUCTIONS DE RÉPONSE
                =========================================================

                Réponds directement à la question du pharmacien.

                Si la question concerne le stock :
                - indique les médicaments en rupture ;
                - indique les médicaments avec un stock faible ;
                - indique les médicaments non disponibles si pertinent.

                Si la question concerne les commandes :
                - indique les commandes pertinentes ;
                - indique leur statut ;
                - indique les médicaments concernés ;
                - indique les montants lorsque pertinent.

                Si la question concerne à la fois les commandes et le stock,
                utilise les deux sources de données.

                Ne crée pas de catégorie qui n'est pas pertinente pour
                la question.

                Fais une réponse claire, courte et professionnelle.
                Utilise des listes à puces lorsque cela améliore la lisibilité.
                """.formatted(
                ordersData,
                stockData,
                question
        );

        // =========================================================
        // 6. SEND EVERYTHING TO OLLAMA
        // =========================================================

        return ollamaService.generate(prompt);
    }
}
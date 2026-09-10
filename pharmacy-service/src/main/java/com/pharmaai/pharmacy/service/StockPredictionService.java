package com.pharmaai.pharmacy.service;

import com.pharmaai.pharmacy.dto.StockPredictionDTO;
import com.pharmaai.pharmacy.entity.Order;
import com.pharmaai.pharmacy.entity.OrderItem;
import com.pharmaai.pharmacy.entity.PharmacyStock;
import com.pharmaai.pharmacy.repository.OrderRepository;
import com.pharmaai.pharmacy.repository.PharmacyStockRepository;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class StockPredictionService {

    private static final int ANALYSIS_DAYS = 28;
    private static final int TARGET_STOCK_WEEKS = 4;

    private final OrderRepository orderRepository;
    private final PharmacyStockRepository pharmacyStockRepository;

    public StockPredictionService(
            OrderRepository orderRepository,
            PharmacyStockRepository pharmacyStockRepository
    ) {
        this.orderRepository = orderRepository;
        this.pharmacyStockRepository = pharmacyStockRepository;
    }

    public List<StockPredictionDTO> analyzeStock(Long pharmacyId) {

        OffsetDateTime since = OffsetDateTime.now()
                .minusDays(ANALYSIS_DAYS);

        List<Order> orders =
                orderRepository
                        .findByPharmacyIdAndCreatedAtAfterOrderByCreatedAtDesc(
                                pharmacyId,
                                since
                        );

        List<PharmacyStock> stocks =
                pharmacyStockRepository.findByPharmacyId(pharmacyId);

        /*
         * Calculate the total quantity ordered for every medicine
         * during the analysis period.
         */
        Map<Long, Integer> demandByMedicine = new HashMap<>();

        for (Order order : orders) {

            /*
             * Cancelled orders should not contribute to demand.
             */
        	if (!isDemandGeneratingOrder(order)) {
        	    continue;
        	}

            for (OrderItem item : order.getItems()) {

                if (item.getMedicine() == null ||
                        item.getMedicine().getId() == null) {
                    continue;
                }

                Long medicineId = item.getMedicine().getId();

                int quantity = item.getQuantity() != null
                        ? item.getQuantity()
                        : 0;

                demandByMedicine.merge(
                        medicineId,
                        quantity,
                        Integer::sum
                );
            }
        }

        List<StockPredictionDTO> predictions = new ArrayList<>();

        for (PharmacyStock stock : stocks) {

            if (stock.getMedicine() == null) {
                continue;
            }

            Long medicineId = stock.getMedicine().getId();

            int currentStock = stock.getQuantity() != null
                    ? stock.getQuantity()
                    : 0;

            int demandLast28Days =
                    demandByMedicine.getOrDefault(medicineId, 0);

            /*
             * 28 days ≈ 4 weeks.
             */
            double weeklyDemand =
                    demandLast28Days / 4.0;

            double weeksOfStock;

            if (weeklyDemand > 0) {
                weeksOfStock =
                        currentStock / weeklyDemand;
            } else {
                weeksOfStock = Double.POSITIVE_INFINITY;
            }

            String alertType = determineAlertType(
                    currentStock,
                    weeklyDemand,
                    weeksOfStock
            );

            /*
             * Only return medicines that actually need attention.
             */
            if (alertType == null) {
                continue;
            }

            int recommendedQuantity =
                    calculateRecommendedQuantity(
                            currentStock,
                            weeklyDemand
                    );

            String alertMessage =
                    buildAlertMessage(
                            stock.getMedicine().getName(),
                            currentStock,
                            weeklyDemand,
                            alertType,
                            recommendedQuantity
                    );

            predictions.add(
                    new StockPredictionDTO(
                            medicineId,
                            stock.getMedicine().getName(),
                            currentStock,
                            round(weeklyDemand),
                            round(weeksOfStock),
                            alertType,
                            alertMessage,
                            recommendedQuantity
                    )
            );
        }

        /*
         * Critical alerts first,
         * then low stock,
         * then other alerts.
         */
        predictions.sort(
                (a, b) ->
                        Integer.compare(
                                getPriority(a.getAlertType()),
                                getPriority(b.getAlertType())
                        )
        );

        return predictions;
    }

    private String determineAlertType(
            int currentStock,
            double weeklyDemand,
            double weeksOfStock
    ) {

        // Completely out of stock
        if (currentStock == 0) {
            return "CRITICAL";
        }

        // No historical demand
        if (weeklyDemand == 0) {

            /*
             * We don't have enough information to predict
             * whether this medicine should be reordered.
             *
             * However, a very small quantity is still dangerous.
             */
            if (currentStock <= 5) {
                return "CRITICAL";
            }

            /*
             * A medicine with stock but no recent sales is
             * potentially slow-moving.
             */
            if (currentStock < 20) {
                return "SLOW_MOVING";
            }

            /*
             * Don't automatically call 50 units "overstock".
             * We simply don't have enough demand information.
             */
            return null;
        }

        // Less than or equal to one week of stock
        if (weeksOfStock <= 1) {
            return "CRITICAL";
        }

        // Less than or equal to two weeks of stock
        if (weeksOfStock <= 2) {
            return "LOW_STOCK";
        }

        // Very low activity
        if (weeklyDemand < 1) {
            return "SLOW_MOVING";
        }

        /*
         * Large stock coverage combined with low demand
         * indicates potential overstock.
         */
        if (weeksOfStock >= 8 && weeklyDemand < 5) {
            return "OVERSTOCK";
        }

        /*
         * High demand.
         *
         * We keep this threshold for now. Later we can make
         * it relative to the pharmacy's actual demand.
         */
        if (weeklyDemand >= 10) {
            return "HIGH_DEMAND";
        }

        return null;
    }

    private int calculateRecommendedQuantity(
            int currentStock,
            double weeklyDemand
    ) {

        /*
         * No historical demand means we cannot reliably
         * predict how much should be ordered.
         */
        if (weeklyDemand <= 0) {
            return 0;
        }

        /*
         * Maintain approximately four weeks of stock.
         */
        int targetStock =
                (int) Math.ceil(
                        weeklyDemand * TARGET_STOCK_WEEKS
                );

        return Math.max(
                0,
                targetStock - currentStock
        );
    }

    private String buildAlertMessage(
            String medicineName,
            int currentStock,
            double weeklyDemand,
            String alertType,
            int recommendedQuantity
    ) {

        switch (alertType) {

            case "CRITICAL":

                if (weeklyDemand <= 0) {
                    return medicineName
                            + " est en niveau critique. "
                            + "Stock actuel : "
                            + currentStock
                            + " unités. "
                            + "Aucune demande récente n'a été enregistrée, "
                            + "la quantité de réapprovisionnement ne peut pas "
                            + "être estimée de manière fiable.";
                }

                return medicineName
                        + " risque d'être en rupture prochainement. "
                        + "Stock actuel : "
                        + currentStock
                        + " unités. "
                        + "Demande récente : "
                        + round(weeklyDemand)
                        + " unités/semaine. "
                        + "Recommandation : réapprovisionner environ "
                        + recommendedQuantity
                        + " unités.";

            case "LOW_STOCK":

                return medicineName
                        + " présente un niveau de stock faible. "
                        + "Stock actuel : "
                        + currentStock
                        + " unités. "
                        + "Demande récente : "
                        + round(weeklyDemand)
                        + " unités/semaine. "
                        + "Recommandation : réapprovisionner environ "
                        + recommendedQuantity
                        + " unités.";

            case "HIGH_DEMAND":

                return medicineName
                        + " est actuellement très demandé. "
                        + "Demande récente : "
                        + round(weeklyDemand)
                        + " unités/semaine. "
                        + "Stock actuel : "
                        + currentStock
                        + " unités. "
                        + "Il est recommandé de surveiller régulièrement "
                        + "son niveau de stock.";

            case "SLOW_MOVING":

                return medicineName
                        + " présente une faible activité. "
                        + "Stock actuel : "
                        + currentStock
                        + " unités. "
                        + "Demande récente : "
                        + round(weeklyDemand)
                        + " unités/semaine.";

            case "OVERSTOCK":

                return medicineName
                        + " semble présenter un risque de surstock. "
                        + "Stock actuel : "
                        + currentStock
                        + " unités pour une demande de "
                        + round(weeklyDemand)
                        + " unités/semaine. "
                        + "Le stock actuel représente environ "
                        + round(
                            currentStock / weeklyDemand
                        )
                        + " semaines de couverture.";

            default:

                return medicineName;
        }
    }

    private boolean isDemandGeneratingOrder(Order order) {

        if (order.getStatus() == null) {
            return false;
        }

        String status =
                order.getStatus().trim().toLowerCase();

        return status.equals("accepted")
                || status.equals("ready_for_pickup")
                || status.equals("awaiting_agent");
    }

    private int getPriority(String alertType) {

        return switch (alertType) {

            case "CRITICAL" -> 1;
            case "LOW_STOCK" -> 2;
            case "HIGH_DEMAND" -> 3;
            case "SLOW_MOVING" -> 4;
            case "OVERSTOCK" -> 5;

            default -> 99;
        };
    }

    private double round(double value) {

        if (Double.isInfinite(value)) {
            return value;
        }

        return Math.round(value * 100.0) / 100.0;
    }
}
package com.pharmaai.pharmacy.controller;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.pharmaai.pharmacy.dto.OrderResponse;
import com.pharmaai.pharmacy.dto.OrderStatusUpdateRequest;
import com.pharmaai.pharmacy.dto.ScanItemProgressResponse;
import com.pharmaai.pharmacy.dto.ScanMedicineRequest;
import com.pharmaai.pharmacy.dto.ScanMedicineResponse;
import com.pharmaai.pharmacy.dto.ScanProgressResponse;
import com.pharmaai.pharmacy.entity.Medicine;
import com.pharmaai.pharmacy.entity.OrderItem;
import com.pharmaai.pharmacy.repository.MedicineRepository;
import com.pharmaai.pharmacy.repository.OrderItemRepository;
import com.pharmaai.pharmacy.service.OrderService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/pharmacy")
public class OrderController {

    private final OrderService orderService;
    private final MedicineRepository medicineRepository;
    private final OrderItemRepository orderItemRepository;

    public OrderController(
            OrderService orderService,
            MedicineRepository medicineRepository,
            OrderItemRepository orderItemRepository
    ) {
        this.orderService = orderService;
        this.medicineRepository = medicineRepository;
        this.orderItemRepository = orderItemRepository;
    }

    // =========================================================
    // GET ALL ORDERS FOR A PHARMACY
    // =========================================================

    @GetMapping("/{pharmacyId}/orders")
    public List<OrderResponse> getOrders(
            @PathVariable Long pharmacyId
    ) {
        return orderService.getOrdersForPharmacy(pharmacyId);
    }

    // =========================================================
    // GET ONE ORDER
    // =========================================================

    @GetMapping("/{pharmacyId}/orders/{orderId}")
    public OrderResponse getOrder(
            @PathVariable Long pharmacyId,
            @PathVariable Long orderId
    ) {
        return orderService.getOrderForPharmacy(
                pharmacyId,
                orderId
        );
    }

    // =========================================================
    // UPDATE ORDER STATUS
    // =========================================================

    @PutMapping("/{pharmacyId}/orders/{orderId}/status")
    public OrderResponse updateOrderStatus(
            @PathVariable Long pharmacyId,
            @PathVariable Long orderId,
            @Valid @RequestBody OrderStatusUpdateRequest request
    ) {
        return orderService.updateOrderStatus(
                pharmacyId,
                orderId,
                request.getStatus()
        );
    }

    // =========================================================
    // SCAN MEDICINE
    // =========================================================

    @PostMapping("/{pharmacyId}/orders/{orderId}/scan")
    public ResponseEntity<?> scanMedicine(
            @PathVariable Long pharmacyId,
            @PathVariable Long orderId,
            @RequestBody ScanMedicineRequest request
    ) {

        // -----------------------------------------------------
        // 1. Validate barcode
        // -----------------------------------------------------

        if (request.getBarcode() == null ||
                request.getBarcode().isBlank()) {

            return ResponseEntity.badRequest().body(Map.of(
                    "success", false,
                    "message", "Barcode is required"
            ));
        }

        String barcode = request.getBarcode().trim();

        // -----------------------------------------------------
        // 2. Find medicine using barcode
        // -----------------------------------------------------

        Optional<Medicine> medicineOptional =
                medicineRepository.findByBarcode(barcode);

        if (medicineOptional.isEmpty()) {

            return ResponseEntity.badRequest().body(Map.of(
                    "success", false,
                    "message", "Unknown barcode",
                    "barcode", barcode
            ));
        }

        Medicine medicine = medicineOptional.get();

        // -----------------------------------------------------
        // 3. Verify medicine belongs to this order
        // -----------------------------------------------------

        Optional<OrderItem> orderItemOptional =
                orderItemRepository.findByOrder_IdAndMedicine_Id(
                        orderId,
                        medicine.getId()
                );

        if (orderItemOptional.isEmpty()) {

            return ResponseEntity.badRequest().body(Map.of(
                    "success", false,
                    "message", "This medicine is not part of this order",
                    "medicine", medicine.getName(),
                    "barcode", barcode
            ));
        }

        OrderItem orderItem = orderItemOptional.get();

        // -----------------------------------------------------
        // 4. Get quantities
        // -----------------------------------------------------

        int scanned = orderItem.getScannedQuantity();
        int required = orderItem.getQuantity();

        // -----------------------------------------------------
        // 5. Prevent over-scanning
        // -----------------------------------------------------

        if (scanned >= required) {

            return ResponseEntity.badRequest().body(Map.of(
                    "success", false,
                    "message", "Required quantity already fully scanned",
                    "medicine", medicine.getName(),
                    "scannedQuantity", scanned,
                    "requiredQuantity", required
            ));
        }

        // -----------------------------------------------------
        // 6. Increment scanned quantity
        // -----------------------------------------------------

        orderItem.setScannedQuantity(scanned + 1);

        // -----------------------------------------------------
        // 7. Save scan
        // -----------------------------------------------------

        orderItemRepository.save(orderItem);

        // -----------------------------------------------------
        // 8. First successful scan: accepted -> preparing
        // -----------------------------------------------------

        OrderResponse order =
                orderService.getOrderForPharmacy(
                        pharmacyId,
                        orderId
                );

        if ("accepted".equalsIgnoreCase(order.getStatus())) {

            orderService.updateOrderStatus(
                    pharmacyId,
                    orderId,
                    "preparing"
            );
        }

        // -----------------------------------------------------
        // 9. Reload all order items
        // -----------------------------------------------------

        List<OrderItem> updatedItems =
                orderItemRepository.findByOrder_Id(orderId);

        // -----------------------------------------------------
        // 10. Check whether all items are complete
        // -----------------------------------------------------

        boolean allItemsScanned =
                updatedItems.stream()
                        .allMatch(item ->
                                item.getScannedQuantity()
                                        >= item.getQuantity()
                        );

        // -----------------------------------------------------
        // 11. If complete -> ready_for_pickup
        // -----------------------------------------------------

        if (allItemsScanned) {

            orderService.updateOrderStatus(
                    pharmacyId,
                    orderId,
                    "ready_for_pickup"
            );
        }

        // -----------------------------------------------------
        // 12. Calculate overall required quantity
        // -----------------------------------------------------

        int totalRequired =
                updatedItems.stream()
                        .mapToInt(OrderItem::getQuantity)
                        .sum();

        // -----------------------------------------------------
        // 13. Calculate overall scanned quantity
        // -----------------------------------------------------

        int totalScanned =
                updatedItems.stream()
                        .mapToInt(OrderItem::getScannedQuantity)
                        .sum();

        // -----------------------------------------------------
        // 14. Calculate percentage
        // -----------------------------------------------------

        int percentage =
                totalRequired == 0
                        ? 0
                        : (int) Math.round(
                                (totalScanned * 100.0)
                                        / totalRequired
                        );

        // -----------------------------------------------------
        // 15. Build item progress response
        // -----------------------------------------------------

        List<ScanItemProgressResponse> itemResponses =
                updatedItems.stream()
                        .map(item ->
                                new ScanItemProgressResponse(
                                        item.getId(),
                                        item.getMedicine().getId(),
                                        item.getMedicine().getName(),
                                        item.getQuantity(),
                                        item.getScannedQuantity(),
                                        item.getScannedQuantity()
                                                >= item.getQuantity()
                                )
                        )
                        .toList();

        // -----------------------------------------------------
        // 16. Get final order status
        // -----------------------------------------------------

        OrderResponse updatedOrder =
                orderService.getOrderForPharmacy(
                        pharmacyId,
                        orderId
                );

        // -----------------------------------------------------
        // 17. Build progress object
        // -----------------------------------------------------

        ScanProgressResponse progress =
                new ScanProgressResponse(
                        totalScanned,
                        totalRequired,
                        percentage
                );

        // -----------------------------------------------------
        // 18. Build final scan response
        // -----------------------------------------------------

        ScanMedicineResponse response =
                new ScanMedicineResponse(
                        true,
                        "Medicine scanned successfully",
                        orderId,
                        updatedOrder.getStatus(),
                        medicine.getId(),
                        medicine.getName(),
                        medicine.getBarcode(),
                        progress,
                        itemResponses
                );

        return ResponseEntity.ok(response);
    }
}
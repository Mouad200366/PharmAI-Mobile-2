package com.pharmaai.pharmacy.service;

import com.pharmaai.pharmacy.dto.OrderItemResponse;
import com.pharmaai.pharmacy.dto.OrderResponse;
import com.pharmaai.pharmacy.entity.Order;
import com.pharmaai.pharmacy.entity.OrderItem;
import com.pharmaai.pharmacy.repository.OrderRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.pharmaai.pharmacy.entity.User;
import com.pharmaai.pharmacy.repository.UserRepository;
import java.util.List;

@Service
public class OrderService {

    private final OrderRepository orderRepository;
    private final UserRepository userRepository;

    public OrderService(
            OrderRepository orderRepository,
            UserRepository userRepository
    ) {
        this.orderRepository = orderRepository;
        this.userRepository = userRepository;
    }
    // =========================================================
    // GET ALL ORDERS FOR A PHARMACY
    // =========================================================

    @Transactional(readOnly = true)
    public List<OrderResponse> getOrdersForPharmacy(Long pharmacyId) {

        List<Order> orders =
                orderRepository.findByPharmacyIdOrderByCreatedAtDesc(pharmacyId);

        return orders.stream()
                .map(this::toResponse)
                .toList();
    }


    // =========================================================
    // GET ONE ORDER BY ID
    // =========================================================

    @Transactional(readOnly = true)
    public OrderResponse getOrderForPharmacy(
            Long pharmacyId,
            Long orderId
    ) {

        Order order = orderRepository.findById(orderId)
                .orElseThrow(() ->
                        new RuntimeException(
                                "Order not found: " + orderId
                        )
                );

        // Make sure the order belongs to this pharmacy
        if (order.getPharmacy() == null ||
                !order.getPharmacy().getId().equals(pharmacyId)) {

            throw new RuntimeException(
                    "Order does not belong to this pharmacy"
            );
        }

        return toResponse(order);
    }


    // =========================================================
    // CONVERT ORDER → ORDER RESPONSE
    // =========================================================

    private OrderResponse toResponse(Order order) {

        List<OrderItemResponse> items =
                order.getItems()
                        .stream()
                        .map(this::toItemResponse)
                        .toList();

        Long pharmacyId =
                order.getPharmacy() != null
                        ? order.getPharmacy().getId()
                        : null;

        User customer =
                userRepository.findById(order.getCustomerId())
                        .orElse(null);

        String customerName =
                customer != null
                        ? customer.getFullName()
                        : "Client #" + order.getCustomerId();

        return new OrderResponse(
                order.getId(),
                order.getCreatedAt(),
                order.getDeliveryAddress(),
                order.getItemsTotal(),
                order.getDeliveryFee(),
                order.getGrandTotal(),
                order.getStatus(),
                order.getPrescriptionMode(),
                order.getPaymentMethod(),
                order.getNotes(),
                order.getCustomerId(),
                customerName,
                pharmacyId,
                items
        );
    }


    // =========================================================
    // CONVERT ORDER ITEM → ORDER ITEM RESPONSE
    // =========================================================

    private OrderItemResponse toItemResponse(OrderItem item) {

        return new OrderItemResponse(
                item.getId(),
                item.getMedicine().getId(),
                item.getMedicine().getName(),
                item.getQuantity(),
                item.getScannedQuantity(),
                item.getUnitPrice()
        );
    }


    // =========================================================
    // UPDATE ORDER STATUS
    // =========================================================
    @Transactional
    public OrderResponse updateOrderStatus(
            Long pharmacyId,
            Long orderId,
            String newStatus
    ) {

        Order order = orderRepository.findById(orderId)
                .orElseThrow(() ->
                        new RuntimeException(
                                "Order not found: " + orderId
                        )
                );

        // Make sure this order belongs to this pharmacy
        if (order.getPharmacy() == null ||
                !order.getPharmacy().getId().equals(pharmacyId)) {

            throw new RuntimeException(
                    "Order does not belong to this pharmacy"
            );
        }

        // Validate allowed statuses
        if (!newStatus.equals("accepted")
        		&& !newStatus.equals("preparing")
                && !newStatus.equals("ready_for_pickup")
                && !newStatus.equals("awaiting_agent")) {

            throw new IllegalArgumentException(
                    "Invalid order status: " + newStatus
            );
        }

        order.setStatus(newStatus);

        Order savedOrder =
                orderRepository.save(order);

        return toResponse(savedOrder);
    }
}
"""Tests for refund_order — the single chokepoint for cancellations.

Cash flows are tested directly. Card flows mock the Stripe SDK so we don't
hit the network or need a `STRIPE_SECRET_KEY`.
"""
from unittest.mock import patch

import pytest

from apps.orders.constants import OrderStatus, PaymentMethod, PrescriptionMode
from apps.orders.services.place_order import place_order
from apps.payments.constants import PaymentStatus
from apps.payments.services.refund import refund_order

pytestmark = pytest.mark.django_db


def _fresh_cash_order(patient, stock):
    return place_order(
        customer=patient,
        items=[{'medicine': stock.medicine_id, 'quantity': 2}],
        delivery_address='X', latitude=33.5731, longitude=-7.5898,
        prescription_mode=PrescriptionMode.NONE,
        payment_method=PaymentMethod.CASH,
    )


def test_cash_unpaid_refund_cancels_payment_and_restores_stock(patient, pharmacy, stock):
    initial_qty = stock.quantity
    order = _fresh_cash_order(patient, stock)
    stock.refresh_from_db()
    assert stock.quantity == initial_qty - 2

    refund_order(order, reason='customer_cancellation', actor=patient)

    order.refresh_from_db()
    stock.refresh_from_db()
    assert order.status == OrderStatus.CANCELLED
    assert order.payment.status == PaymentStatus.CANCELLED
    assert stock.quantity == initial_qty  # restored


def test_card_paid_refund_calls_stripe_and_marks_refunded(patient, pharmacy, stock):
    """Simulates a card order that already settled — refund must hit Stripe."""
    order = place_order(
        customer=patient,
        items=[{'medicine': stock.medicine_id, 'quantity': 1}],
        delivery_address='X', latitude=33.5731, longitude=-7.5898,
        prescription_mode=PrescriptionMode.NONE,
        payment_method=PaymentMethod.CARD,
    )
    # Pretend the webhook already arrived.
    order.payment.provider_payment_id = 'pi_test_123'
    order.payment.status = PaymentStatus.PAID
    order.payment.save()

    with patch(
        'apps.payments.services.stripe_service.refund_payment',
    ) as mock_refund:
        refund_order(order, reason='customer_cancellation', actor=patient)
        mock_refund.assert_called_once()

    order.refresh_from_db()
    assert order.payment.status == PaymentStatus.REFUNDED


def test_card_unpaid_refund_does_not_call_stripe(patient, pharmacy, stock):
    """No money moved → no Stripe call, just mark Payment cancelled."""
    order = place_order(
        customer=patient,
        items=[{'medicine': stock.medicine_id, 'quantity': 1}],
        delivery_address='X', latitude=33.5731, longitude=-7.5898,
        prescription_mode=PrescriptionMode.NONE,
        payment_method=PaymentMethod.CARD,
    )
    # Payment is still PENDING (no webhook has arrived yet).
    assert order.payment.status == PaymentStatus.PENDING

    with patch(
        'apps.payments.services.stripe_service.refund_payment',
    ) as mock_refund:
        refund_order(order, actor=patient)
        mock_refund.assert_not_called()

    order.refresh_from_db()
    assert order.payment.status == PaymentStatus.CANCELLED


def test_terminal_status_refund_does_not_re_transition(patient, pharmacy, stock):
    """Refunding an already-DELIVERED order shouldn't try to move it to CANCELLED."""
    from apps.orders.constants import OrderStatus
    order = _fresh_cash_order(patient, stock)
    order.status = OrderStatus.DELIVERED
    order.save(update_fields=('status', 'updated_at'))

    refund_order(order, actor=patient)

    order.refresh_from_db()
    # Stays DELIVERED — TRANSITIONS[DELIVERED] is empty so refund_order is a no-op for status.
    assert order.status == OrderStatus.DELIVERED
    # But the payment moves from PAID → REFUNDED (signal already marked it PAID on delivery).
    assert order.payment.status == PaymentStatus.REFUNDED

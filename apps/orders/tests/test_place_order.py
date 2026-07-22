"""Integration tests for the place_order orchestrator.

Covers the high-value paths: happy path, no pharmacy in range, insufficient
stock, and Rx requirement violations. Each test uses the standard fixtures
from `tests/conftest.py`."""
from decimal import Decimal

import pytest
from rest_framework.exceptions import ValidationError

from apps.orders.constants import OrderStatus, PaymentMethod, PrescriptionMode
from apps.orders.services.place_order import place_order
from apps.payments.constants import PaymentStatus

pytestmark = pytest.mark.django_db


def test_happy_path_creates_order_items_and_payment(patient, pharmacy, stock):
    order = place_order(
        customer=patient,
        items=[{'medicine': stock.medicine_id, 'quantity': 2}],
        delivery_address='Place Mohammed V',
        latitude=33.5731,
        longitude=-7.5898,
        prescription_mode=PrescriptionMode.NONE,
        payment_method=PaymentMethod.CASH,
    )

    assert order.pharmacy_id == pharmacy.id
    assert order.status == OrderStatus.ACCEPTED
    assert order.items.count() == 1
    item = order.items.first()
    assert item.quantity == 2
    assert item.unit_price == Decimal('12.50')
    assert order.items_total == Decimal('25.00')
    assert order.grand_total == Decimal('40.00')  # 25 + 15 delivery_fee

    payment = order.payment
    assert payment.provider == 'cash'
    assert payment.status == PaymentStatus.PENDING
    assert payment.amount == order.grand_total


def test_stock_decrements_on_order(patient, pharmacy, stock):
    initial = stock.quantity
    place_order(
        customer=patient,
        items=[{'medicine': stock.medicine_id, 'quantity': 3}],
        delivery_address='X', latitude=33.5731, longitude=-7.5898,
        prescription_mode=PrescriptionMode.NONE,
        payment_method=PaymentMethod.CASH,
    )
    stock.refresh_from_db()
    assert stock.quantity == initial - 3


def test_no_pharmacy_in_range_raises(db, patient, medicine):
    """No pharmacy exists at all → service refuses with a clear error."""
    with pytest.raises(ValidationError):
        place_order(
            customer=patient,
            items=[{'medicine': medicine.id, 'quantity': 1}],
            delivery_address='Nowhere', latitude=33.5731, longitude=-7.5898,
            prescription_mode=PrescriptionMode.NONE,
            payment_method=PaymentMethod.CASH,
        )


def test_insufficient_stock_raises(patient, pharmacy, stock):
    with pytest.raises(ValidationError):
        place_order(
            customer=patient,
            items=[{'medicine': stock.medicine_id, 'quantity': stock.quantity + 1}],
            delivery_address='X', latitude=33.5731, longitude=-7.5898,
            prescription_mode=PrescriptionMode.NONE,
            payment_method=PaymentMethod.CASH,
        )


def test_rx_required_without_mode_raises(patient, pharmacy, rx_medicine):
    """Medicine flagged requires_prescription + mode=none must reject."""
    from apps.pharmacies.models import PharmacyStock
    PharmacyStock.objects.create(
        pharmacy=pharmacy, medicine=rx_medicine,
        price=Decimal('48.00'), quantity=10, is_available=True,
    )
    with pytest.raises(ValidationError):
        place_order(
            customer=patient,
            items=[{'medicine': rx_medicine.id, 'quantity': 1}],
            delivery_address='X', latitude=33.5731, longitude=-7.5898,
            prescription_mode=PrescriptionMode.NONE,
            payment_method=PaymentMethod.CASH,
        )


def test_card_payment_starts_in_pending_payment(patient, pharmacy, stock):
    """Card orders must NOT skip straight to ACCEPTED — webhook drives them."""
    order = place_order(
        customer=patient,
        items=[{'medicine': stock.medicine_id, 'quantity': 1}],
        delivery_address='X', latitude=33.5731, longitude=-7.5898,
        prescription_mode=PrescriptionMode.NONE,
        payment_method=PaymentMethod.CARD,
    )
    assert order.status == OrderStatus.PENDING_PAYMENT
    assert order.payment.provider == 'card'
    assert order.payment.status == PaymentStatus.PENDING
    # No agent should be assigned for a card order until the webhook fires.
    assert order.delivery_agent_id is None

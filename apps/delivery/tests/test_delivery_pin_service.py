from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password
from django.contrib.gis.geos import Point
from rest_framework.exceptions import ValidationError

from apps.core.constants import UserRole
from apps.delivery.models import (
    DeliveryVerification,
    DeliveryVerificationType,
)
from apps.delivery.services.delivery_proof import issue_delivery_pin
from apps.orders.constants import OrderStatus, PaymentMethod
from apps.orders.models import Order


User = get_user_model()


def _create_delivery_agent(*, phone, email, cin, first_name):
    return User.objects.create_user(
        phone=phone,
        password="StrongPass123!",
        email=email,
        cin=cin,
        first_name=first_name,
        last_name="Courier",
        date_of_birth=date(1993, 1, 1),
        gender="M",
        role=UserRole.DELIVERY,
        is_phone_verified=True,
    )


@pytest.fixture
def delivery_proof_agent(db):
    return _create_delivery_agent(
        phone="+212600750001",
        email="delivery.proof.agent@example.com",
        cin="DP123451",
        first_name="DeliveryProof",
    )


@pytest.fixture
def delivery_proof_order(patient, pharmacy, delivery_proof_agent):
    return Order.objects.create(
        customer=patient,
        pharmacy=pharmacy,
        delivery_agent=delivery_proof_agent,
        delivery_address="Maarif, Casablanca",
        delivery_location=Point(
            -7.6320,
            33.5860,
            srid=4326,
        ),
        items_total=Decimal("50.00"),
        delivery_fee=Decimal("15.00"),
        grand_total=Decimal("65.00"),
        status=OrderStatus.OUT_FOR_DELIVERY,
        payment_method=PaymentMethod.CASH,
    )


@pytest.mark.django_db
def test_issue_delivery_pin_stores_only_hash(
    delivery_proof_order,
    patient,
):
    result = issue_delivery_pin(
        order_id=delivery_proof_order.id,
        customer=patient,
    )

    verification = result["verification"]
    pin = result["pin"]

    assert len(pin) == 6
    assert pin.isdigit()

    assert verification.verification_type == DeliveryVerificationType.DELIVERY
    assert verification.pin_hash != pin
    assert check_password(pin, verification.pin_hash)

    assert verification.qr_token_hash == ""
    assert verification.failed_attempts == 0
    assert verification.used_at is None
    assert verification.is_valid is True


@pytest.mark.django_db
def test_reissuing_delivery_pin_rotates_existing_pin(
    delivery_proof_order,
    patient,
):
    first = issue_delivery_pin(
        order_id=delivery_proof_order.id,
        customer=patient,
    )

    second = issue_delivery_pin(
        order_id=delivery_proof_order.id,
        customer=patient,
    )

    assert first["verification"].id == second["verification"].id
    assert first["pin"] != second["pin"]

    verification = DeliveryVerification.objects.get(
        order=delivery_proof_order,
        verification_type=DeliveryVerificationType.DELIVERY,
    )

    assert check_password(second["pin"], verification.pin_hash)
    assert not check_password(first["pin"], verification.pin_hash)


@pytest.mark.django_db
def test_non_customer_cannot_issue_delivery_pin(
    delivery_proof_order,
    delivery_proof_agent,
):
    with pytest.raises(
        ValidationError,
        match="You are not the customer for this order",
    ):
        issue_delivery_pin(
            order_id=delivery_proof_order.id,
            customer=delivery_proof_agent,
        )

    assert not DeliveryVerification.objects.filter(
        order=delivery_proof_order,
        verification_type=DeliveryVerificationType.DELIVERY,
    ).exists()


@pytest.mark.django_db
def test_delivery_pin_requires_out_for_delivery_status(
    delivery_proof_order,
    patient,
):
    delivery_proof_order.status = OrderStatus.PICKED_UP
    delivery_proof_order.save(
        update_fields=(
            "status",
            "updated_at",
        )
    )

    with pytest.raises(
        ValidationError,
        match="Delivery PIN is available only while the order is out for delivery",
    ):
        issue_delivery_pin(
            order_id=delivery_proof_order.id,
            customer=patient,
        )

    assert not DeliveryVerification.objects.filter(
        order=delivery_proof_order,
        verification_type=DeliveryVerificationType.DELIVERY,
    ).exists()


@pytest.mark.django_db
def test_delivery_pin_requires_assigned_agent(
    delivery_proof_order,
    patient,
):
    delivery_proof_order.delivery_agent = None
    delivery_proof_order.save(
        update_fields=(
            "delivery_agent",
            "updated_at",
        )
    )

    with pytest.raises(
        ValidationError,
        match="This order does not have an assigned delivery agent",
    ):
        issue_delivery_pin(
            order_id=delivery_proof_order.id,
            customer=patient,
        )

    assert not DeliveryVerification.objects.filter(
        order=delivery_proof_order,
        verification_type=DeliveryVerificationType.DELIVERY,
    ).exists()
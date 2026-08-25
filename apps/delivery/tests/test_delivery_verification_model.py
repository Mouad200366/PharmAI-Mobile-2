from datetime import timedelta
from decimal import Decimal

import pytest
from django.contrib.gis.geos import Point
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.delivery.models import (
    DeliveryVerification,
    DeliveryVerificationMethod,
    DeliveryVerificationType,
)
from apps.orders.constants import OrderStatus, PaymentMethod
from apps.orders.models import Order


@pytest.fixture
def verification_order(patient, pharmacy):
    return Order.objects.create(
        customer=patient,
        pharmacy=pharmacy,
        delivery_address="Maarif, Casablanca",
        delivery_location=Point(
            -7.6320,
            33.5860,
            srid=4326,
        ),
        items_total=Decimal("50.00"),
        delivery_fee=Decimal("15.00"),
        grand_total=Decimal("65.00"),
        status=OrderStatus.AWAITING_AGENT,
        payment_method=PaymentMethod.CASH,
    )


@pytest.mark.django_db
def test_delivery_verification_is_valid_when_unused_and_unexpired(
    verification_order,
):
    verification = DeliveryVerification.objects.create(
        order=verification_order,
        verification_type=DeliveryVerificationType.PICKUP,
        qr_token_hash="hashed-qr-token",
        pin_hash="hashed-pin",
        expires_at=timezone.now() + timedelta(minutes=10),
    )

    assert verification.is_used is False
    assert verification.is_expired is False
    assert verification.is_valid is True


@pytest.mark.django_db
def test_delivery_verification_is_invalid_when_expired(
    verification_order,
):
    verification = DeliveryVerification.objects.create(
        order=verification_order,
        verification_type=DeliveryVerificationType.PICKUP,
        qr_token_hash="hashed-qr-token",
        pin_hash="hashed-pin",
        expires_at=timezone.now() - timedelta(seconds=1),
    )

    assert verification.is_expired is True
    assert verification.is_valid is False


@pytest.mark.django_db
def test_delivery_verification_is_invalid_after_use(
    verification_order,
    patient,
):
    verification = DeliveryVerification.objects.create(
        order=verification_order,
        verification_type=DeliveryVerificationType.PICKUP,
        qr_token_hash="hashed-qr-token",
        pin_hash="hashed-pin",
        expires_at=timezone.now() + timedelta(minutes=10),
        used_at=timezone.now(),
        verification_method=DeliveryVerificationMethod.PIN,
        verified_by=patient,
        verified_location=Point(
            -7.5898,
            33.5731,
            srid=4326,
        ),
    )

    assert verification.is_used is True
    assert verification.is_valid is False
    assert verification.verification_method == DeliveryVerificationMethod.PIN


@pytest.mark.django_db
def test_only_one_verification_per_order_and_type(
    verification_order,
):
    DeliveryVerification.objects.create(
        order=verification_order,
        verification_type=DeliveryVerificationType.PICKUP,
        qr_token_hash="first-hash",
        pin_hash="first-pin",
        expires_at=timezone.now() + timedelta(minutes=10),
    )

    with pytest.raises(IntegrityError):
        with transaction.atomic():
            DeliveryVerification.objects.create(
                order=verification_order,
                verification_type=DeliveryVerificationType.PICKUP,
                qr_token_hash="second-hash",
                pin_hash="second-pin",
                expires_at=timezone.now() + timedelta(minutes=10),
            )


@pytest.mark.django_db
def test_same_order_can_have_different_verification_types(
    verification_order,
):
    pickup = DeliveryVerification.objects.create(
        order=verification_order,
        verification_type=DeliveryVerificationType.PICKUP,
        qr_token_hash="pickup-hash",
        pin_hash="pickup-pin",
        expires_at=timezone.now() + timedelta(minutes=10),
    )

    delivery = DeliveryVerification.objects.create(
        order=verification_order,
        verification_type=DeliveryVerificationType.DELIVERY,
        qr_token_hash="delivery-hash",
        pin_hash="delivery-pin",
        expires_at=timezone.now() + timedelta(minutes=10),
    )

    assert pickup.id != delivery.id
    assert DeliveryVerification.objects.filter(
        order=verification_order,
    ).count() == 2
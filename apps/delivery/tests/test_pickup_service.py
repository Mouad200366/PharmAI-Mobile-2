from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password
from django.contrib.gis.geos import Point
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.core.constants import UserRole
from apps.delivery.models import (
    DeliveryVerification,
    DeliveryVerificationMethod,
    DeliveryVerificationType,
)
from apps.delivery.services.pickup import (
    PICKUP_VERIFICATION_MAX_ATTEMPTS,
    issue_pickup_verification,
    verify_pickup,
)
from apps.orders.constants import OrderStatus, PaymentMethod
from apps.orders.models import Order, OrderStatusHistory


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
def pickup_agent(db):
    return _create_delivery_agent(
        phone="+212600710001",
        email="pickup.agent@example.com",
        cin="PU123451",
        first_name="Pickup",
    )


@pytest.fixture
def other_delivery_agent(db):
    return _create_delivery_agent(
        phone="+212600710002",
        email="other.agent@example.com",
        cin="PU123452",
        first_name="Other",
    )


@pytest.fixture
def pickup_order(patient, pharmacy, pickup_agent):
    return Order.objects.create(
        customer=patient,
        pharmacy=pharmacy,
        delivery_agent=pickup_agent,
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
def test_issue_pickup_verification_stores_only_hashes(pickup_order):
    result = issue_pickup_verification(order=pickup_order)

    verification = result["verification"]
    qr_token = result["qr_token"]
    pin = result["pin"]

    assert len(pin) == 6
    assert pin.isdigit()

    assert verification.verification_type == DeliveryVerificationType.PICKUP
    assert verification.qr_token_hash != qr_token
    assert verification.pin_hash != pin

    assert check_password(qr_token, verification.qr_token_hash)
    assert check_password(pin, verification.pin_hash)

    assert verification.failed_attempts == 0
    assert verification.used_at is None
    assert verification.is_valid is True


@pytest.mark.django_db
def test_reissuing_pickup_verification_rotates_credentials(pickup_order):
    first = issue_pickup_verification(order=pickup_order)
    second = issue_pickup_verification(order=pickup_order)

    assert first["verification"].id == second["verification"].id
    assert first["qr_token"] != second["qr_token"]
    assert first["pin"] != second["pin"]

    verification = DeliveryVerification.objects.get(
        order=pickup_order,
        verification_type=DeliveryVerificationType.PICKUP,
    )

    assert check_password(second["qr_token"], verification.qr_token_hash)
    assert check_password(second["pin"], verification.pin_hash)
    assert not check_password(first["qr_token"], verification.qr_token_hash)


@pytest.mark.django_db
def test_correct_pin_verifies_pickup_and_transitions_order(pickup_order, pickup_agent):
    issued = issue_pickup_verification(order=pickup_order)

    verification = verify_pickup(
        order_id=pickup_order.id,
        agent=pickup_agent,
        method=DeliveryVerificationMethod.PIN,
        credential=issued["pin"],
        latitude=33.5731,
        longitude=-7.5898,
    )

    pickup_order.refresh_from_db()
    verification.refresh_from_db()

    assert pickup_order.status == OrderStatus.PICKED_UP
    assert verification.used_at is not None
    assert verification.verification_method == DeliveryVerificationMethod.PIN
    assert verification.verified_by_id == pickup_agent.id
    assert verification.verified_location is not None

    history = OrderStatusHistory.objects.filter(
        order=pickup_order,
        status=OrderStatus.PICKED_UP,
    ).latest("created_at")

    assert history.changed_by_id == pickup_agent.id
    assert history.note == "Pickup verified by delivery agent."


@pytest.mark.django_db
def test_correct_qr_token_verifies_pickup(pickup_order, pickup_agent):
    issued = issue_pickup_verification(order=pickup_order)

    verification = verify_pickup(
        order_id=pickup_order.id,
        agent=pickup_agent,
        method=DeliveryVerificationMethod.QR,
        credential=issued["qr_token"],
        latitude=33.5731,
        longitude=-7.5898,
    )

    pickup_order.refresh_from_db()
    verification.refresh_from_db()

    assert pickup_order.status == OrderStatus.PICKED_UP
    assert verification.verification_method == DeliveryVerificationMethod.QR


@pytest.mark.django_db
def test_wrong_pin_increments_failed_attempts_without_changing_order(
    pickup_order,
    pickup_agent,
):
    issue_pickup_verification(order=pickup_order)

    with pytest.raises(ValidationError, match="Invalid pickup credential"):
        verify_pickup(
            order_id=pickup_order.id,
            agent=pickup_agent,
            method=DeliveryVerificationMethod.PIN,
            credential="999999",
            latitude=33.5731,
            longitude=-7.5898,
        )

    pickup_order.refresh_from_db()

    verification = DeliveryVerification.objects.get(
        order=pickup_order,
        verification_type=DeliveryVerificationType.PICKUP,
    )

    assert pickup_order.status == OrderStatus.AWAITING_AGENT
    assert verification.failed_attempts == 1
    assert verification.last_failed_at is not None
    assert verification.used_at is None


@pytest.mark.django_db
def test_max_failed_attempts_blocks_even_correct_credential(
    pickup_order,
    pickup_agent,
):
    issued = issue_pickup_verification(order=pickup_order)

    verification = issued["verification"]
    verification.failed_attempts = PICKUP_VERIFICATION_MAX_ATTEMPTS
    verification.save(
        update_fields=(
            "failed_attempts",
            "updated_at",
        )
    )

    with pytest.raises(
        ValidationError,
        match="Too many failed pickup verification attempts",
    ):
        verify_pickup(
            order_id=pickup_order.id,
            agent=pickup_agent,
            method=DeliveryVerificationMethod.PIN,
            credential=issued["pin"],
            latitude=33.5731,
            longitude=-7.5898,
        )

    pickup_order.refresh_from_db()
    assert pickup_order.status == OrderStatus.AWAITING_AGENT


@pytest.mark.django_db
def test_expired_pickup_verification_is_rejected(pickup_order, pickup_agent):
    issued = issue_pickup_verification(order=pickup_order)

    verification = issued["verification"]
    verification.expires_at = timezone.now() - timedelta(seconds=1)
    verification.save(
        update_fields=(
            "expires_at",
            "updated_at",
        )
    )

    with pytest.raises(
        ValidationError,
        match="This pickup verification has expired",
    ):
        verify_pickup(
            order_id=pickup_order.id,
            agent=pickup_agent,
            method=DeliveryVerificationMethod.PIN,
            credential=issued["pin"],
            latitude=33.5731,
            longitude=-7.5898,
        )

    pickup_order.refresh_from_db()
    assert pickup_order.status == OrderStatus.AWAITING_AGENT


@pytest.mark.django_db
def test_non_assigned_agent_cannot_verify_pickup(
    pickup_order,
    other_delivery_agent,
):
    issued = issue_pickup_verification(order=pickup_order)

    with pytest.raises(
        ValidationError,
        match="You are not the assigned delivery agent",
    ):
        verify_pickup(
            order_id=pickup_order.id,
            agent=other_delivery_agent,
            method=DeliveryVerificationMethod.PIN,
            credential=issued["pin"],
            latitude=33.5731,
            longitude=-7.5898,
        )

    pickup_order.refresh_from_db()
    assert pickup_order.status == OrderStatus.AWAITING_AGENT


@pytest.mark.django_db
def test_pickup_verification_requires_valid_coordinates(
    pickup_order,
    pickup_agent,
):
    issued = issue_pickup_verification(order=pickup_order)

    with pytest.raises(
        ValidationError,
        match="Latitude must be between -90 and 90",
    ):
        verify_pickup(
            order_id=pickup_order.id,
            agent=pickup_agent,
            method=DeliveryVerificationMethod.PIN,
            credential=issued["pin"],
            latitude=100,
            longitude=-7.5898,
        )

    pickup_order.refresh_from_db()
    assert pickup_order.status == OrderStatus.AWAITING_AGENT
from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.contrib.gis.geos import Point
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.core.constants import UserRole
from apps.delivery.models import (
    AgentCashTransaction,
    AgentCashTransactionType,
    DeliveryEarning,
    DeliveryEarningStatus,
    DeliveryIncident,
    DeliveryIncidentReason,
    DeliveryIncidentStatus,
    DeliveryVerification,
    DeliveryVerificationMethod,
    DeliveryVerificationType,
)
from apps.delivery.services.return_finalization import finalize_verified_return
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


def _create_order(*, patient, pharmacy, agent, status):
    return Order.objects.create(
        customer=patient,
        pharmacy=pharmacy,
        delivery_agent=agent,
        delivery_address="Maarif, Casablanca",
        delivery_location=Point(
            -7.6320,
            33.5860,
            srid=4326,
        ),
        items_total=Decimal("50.00"),
        delivery_fee=Decimal("15.00"),
        grand_total=Decimal("65.00"),
        status=status,
        payment_method=PaymentMethod.CASH,
    )


def _create_returned_incident(*, order, agent):
    return DeliveryIncident.objects.create(
        order=order,
        agent=agent,
        reason=DeliveryIncidentReason.CUSTOMER_REFUSED,
        status=DeliveryIncidentStatus.RETURNED,
        reported_order_status=order.status,
        details="Customer refused the package.",
    )


def _create_used_return_verification(*, order, agent):
    now = timezone.now()

    return DeliveryVerification.objects.create(
        order=order,
        verification_type=DeliveryVerificationType.RETURN,
        qr_token_hash=make_password("return-token"),
        pin_hash=make_password("123456"),
        expires_at=now + timedelta(minutes=30),
        used_at=now,
        verification_method=DeliveryVerificationMethod.PIN,
        verified_by=agent,
        verified_location=Point(
            -7.5898,
            33.5731,
            srid=4326,
        ),
    )


@pytest.fixture
def finalization_agent(db):
    return _create_delivery_agent(
        phone="+212600880001",
        email="return.finalization@example.com",
        cin="RF123451",
        first_name="Finalizer",
    )


@pytest.mark.django_db
def test_finalize_verified_return_from_out_for_delivery(
    finalization_agent,
    patient,
    pharmacy,
):
    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=finalization_agent,
        status=OrderStatus.OUT_FOR_DELIVERY,
    )
    incident = _create_returned_incident(
        order=order,
        agent=finalization_agent,
    )
    _create_used_return_verification(
        order=order,
        agent=finalization_agent,
    )

    earning = DeliveryEarning.objects.create(
        order=order,
        agent=finalization_agent,
        amount=Decimal("15.00"),
        status=DeliveryEarningStatus.PENDING,
    )

    result = finalize_verified_return(
        incident_id=incident.id,
        resolution_note="  Package returned safely to pharmacy.  ",
    )

    order.refresh_from_db()
    earning.refresh_from_db()

    assert order.status == OrderStatus.FAILED
    assert earning.status == DeliveryEarningStatus.CANCELLED
    assert result.status == DeliveryIncidentStatus.RESOLVED
    assert result.resolution_note == "Package returned safely to pharmacy."
    assert result.resolved_at is not None


@pytest.mark.django_db
def test_finalize_verified_return_from_picked_up(
    finalization_agent,
    patient,
    pharmacy,
):
    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=finalization_agent,
        status=OrderStatus.PICKED_UP,
    )
    incident = _create_returned_incident(
        order=order,
        agent=finalization_agent,
    )
    _create_used_return_verification(
        order=order,
        agent=finalization_agent,
    )

    result = finalize_verified_return(
        incident_id=incident.id,
    )

    order.refresh_from_db()

    assert order.status == OrderStatus.FAILED
    assert result.status == DeliveryIncidentStatus.RESOLVED


@pytest.mark.django_db
def test_finalize_return_requires_returned_incident(
    finalization_agent,
    patient,
    pharmacy,
):
    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=finalization_agent,
        status=OrderStatus.OUT_FOR_DELIVERY,
    )

    incident = DeliveryIncident.objects.create(
        order=order,
        agent=finalization_agent,
        reason=DeliveryIncidentReason.CUSTOMER_REFUSED,
        status=DeliveryIncidentStatus.RETURNING,
        reported_order_status=order.status,
    )

    _create_used_return_verification(
        order=order,
        agent=finalization_agent,
    )

    with pytest.raises(ValidationError):
        finalize_verified_return(
            incident_id=incident.id,
        )

    order.refresh_from_db()
    incident.refresh_from_db()

    assert order.status == OrderStatus.OUT_FOR_DELIVERY
    assert incident.status == DeliveryIncidentStatus.RETURNING


@pytest.mark.django_db
def test_finalize_return_requires_successful_return_verification(
    finalization_agent,
    patient,
    pharmacy,
):
    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=finalization_agent,
        status=OrderStatus.OUT_FOR_DELIVERY,
    )
    incident = _create_returned_incident(
        order=order,
        agent=finalization_agent,
    )

    DeliveryVerification.objects.create(
        order=order,
        verification_type=DeliveryVerificationType.RETURN,
        pin_hash=make_password("123456"),
        expires_at=timezone.now() + timedelta(minutes=30),
    )

    with pytest.raises(ValidationError):
        finalize_verified_return(
            incident_id=incident.id,
        )

    order.refresh_from_db()
    incident.refresh_from_db()

    assert order.status == OrderStatus.OUT_FOR_DELIVERY
    assert incident.status == DeliveryIncidentStatus.RETURNED


@pytest.mark.django_db
def test_finalize_return_blocks_unreconciled_cod_cash(
    finalization_agent,
    patient,
    pharmacy,
):
    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=finalization_agent,
        status=OrderStatus.OUT_FOR_DELIVERY,
    )
    incident = _create_returned_incident(
        order=order,
        agent=finalization_agent,
    )
    _create_used_return_verification(
        order=order,
        agent=finalization_agent,
    )

    AgentCashTransaction.objects.create(
        agent=finalization_agent,
        order=order,
        transaction_type=AgentCashTransactionType.COLLECTION,
        amount=Decimal("65.00"),
        currency="MAD",
    )

    with pytest.raises(ValidationError):
        finalize_verified_return(
            incident_id=incident.id,
        )

    order.refresh_from_db()
    incident.refresh_from_db()

    assert order.status == OrderStatus.OUT_FOR_DELIVERY
    assert incident.status == DeliveryIncidentStatus.RETURNED


@pytest.mark.django_db
def test_finalize_return_rejects_non_pending_non_cancelled_earning(
    finalization_agent,
    patient,
    pharmacy,
):
    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=finalization_agent,
        status=OrderStatus.OUT_FOR_DELIVERY,
    )
    incident = _create_returned_incident(
        order=order,
        agent=finalization_agent,
    )
    _create_used_return_verification(
        order=order,
        agent=finalization_agent,
    )

    DeliveryEarning.objects.create(
        order=order,
        agent=finalization_agent,
        amount=Decimal("15.00"),
        status=DeliveryEarningStatus.EARNED,
        earned_at=timezone.now(),
    )

    with pytest.raises(ValidationError):
        finalize_verified_return(
            incident_id=incident.id,
        )

    order.refresh_from_db()
    incident.refresh_from_db()

    assert order.status == OrderStatus.OUT_FOR_DELIVERY
    assert incident.status == DeliveryIncidentStatus.RETURNED
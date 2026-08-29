from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point
from rest_framework.exceptions import ValidationError

from apps.core.constants import UserRole
from apps.delivery.models import (
    AgentCashTransaction,
    DeliveryIncident,
    DeliveryIncidentReason,
    DeliveryIncidentStatus,
    DeliveryVerification,
    DeliveryVerificationType,
)
from apps.delivery.services.delivery_proof import (
    complete_delivery,
    issue_delivery_pin,
)
from apps.delivery.services.incident_guards import (
    ACTIVE_DELIVERY_INCIDENT_STATUSES,
    UNRESOLVED_DELIVERY_INCIDENT_MESSAGE,
)
from apps.delivery.services.pickup import (
    issue_pickup_verification,
    verify_pickup,
)
from apps.delivery.services.start_delivery import start_delivery
from apps.orders.constants import OrderStatus, PaymentMethod
from apps.orders.models import Order
from apps.payments.constants import PaymentProvider, PaymentStatus
from apps.payments.models import Payment


User = get_user_model()


def _create_agent():
    return User.objects.create_user(
        phone="+212600799901",
        password="StrongPass123!",
        email="incident.guard.agent@example.com",
        cin="IG123451",
        first_name="Guard",
        last_name="Courier",
        date_of_birth=date(1993, 1, 1),
        gender="M",
        role=UserRole.DELIVERY,
        is_phone_verified=True,
    )


def _make_order(
    *,
    patient,
    pharmacy,
    agent,
    status,
    payment_method=PaymentMethod.CASH,
):
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
        payment_method=payment_method,
    )


def _make_incident(
    *,
    order,
    agent,
    status=DeliveryIncidentStatus.OPEN,
):
    return DeliveryIncident.objects.create(
        order=order,
        agent=agent,
        reason=DeliveryIncidentReason.OTHER,
        status=status,
        reported_order_status=order.status,
        details="Step 7 incident guard regression.",
    )


@pytest.mark.django_db
def test_pickup_credential_issue_is_blocked_by_open_incident(
    patient,
    pharmacy,
):
    agent = _create_agent()
    order = _make_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=agent,
        status=OrderStatus.AWAITING_AGENT,
    )
    _make_incident(order=order, agent=agent)

    with pytest.raises(
        ValidationError,
        match="unresolved incident",
    ):
        issue_pickup_verification(order=order)

    assert not DeliveryVerification.objects.filter(
        order=order,
        verification_type=DeliveryVerificationType.PICKUP,
    ).exists()


@pytest.mark.django_db
def test_pickup_verification_is_blocked_if_incident_appears_after_issue(
    patient,
    pharmacy,
):
    agent = _create_agent()
    order = _make_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=agent,
        status=OrderStatus.AWAITING_AGENT,
    )
    issued = issue_pickup_verification(order=order)
    _make_incident(order=order, agent=agent)

    with pytest.raises(
        ValidationError,
        match="unresolved incident",
    ):
        verify_pickup(
            order_id=order.id,
            agent=agent,
            method="pin",
            credential=issued["pin"],
            latitude=33.5731,
            longitude=-7.5898,
        )

    order.refresh_from_db()
    verification = DeliveryVerification.objects.get(
        order=order,
        verification_type=DeliveryVerificationType.PICKUP,
    )

    assert order.status == OrderStatus.AWAITING_AGENT
    assert verification.used_at is None
    assert verification.failed_attempts == 0


@pytest.mark.django_db
@pytest.mark.parametrize(
    "incident_status",
    ACTIVE_DELIVERY_INCIDENT_STATUSES,
)
def test_start_delivery_is_blocked_for_every_unresolved_incident_status(
    patient,
    pharmacy,
    incident_status,
):
    agent = _create_agent()
    order = _make_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=agent,
        status=OrderStatus.PICKED_UP,
    )
    _make_incident(
        order=order,
        agent=agent,
        status=incident_status,
    )

    with pytest.raises(
        ValidationError,
        match="unresolved incident",
    ):
        start_delivery(
            order_id=order.id,
            agent=agent,
        )

    order.refresh_from_db()
    assert order.status == OrderStatus.PICKED_UP


@pytest.mark.django_db
@pytest.mark.parametrize(
    "incident_status",
    (
        DeliveryIncidentStatus.RESOLVED_CONTINUE,
        DeliveryIncidentStatus.RESOLVED,
    ),
)
def test_resolved_incident_does_not_block_start_delivery(
    patient,
    pharmacy,
    incident_status,
):
    agent = _create_agent()
    order = _make_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=agent,
        status=OrderStatus.PICKED_UP,
    )
    _make_incident(
        order=order,
        agent=agent,
        status=incident_status,
    )

    started = start_delivery(
        order_id=order.id,
        agent=agent,
    )

    started.refresh_from_db()
    assert started.status == OrderStatus.OUT_FOR_DELIVERY


@pytest.mark.django_db
def test_delivery_pin_issue_is_blocked_by_open_incident(
    patient,
    pharmacy,
):
    agent = _create_agent()
    order = _make_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=agent,
        status=OrderStatus.OUT_FOR_DELIVERY,
    )
    _make_incident(order=order, agent=agent)

    with pytest.raises(
        ValidationError,
        match="unresolved incident",
    ):
        issue_delivery_pin(
            order_id=order.id,
            customer=patient,
        )

    assert not DeliveryVerification.objects.filter(
        order=order,
        verification_type=DeliveryVerificationType.DELIVERY,
    ).exists()


@pytest.mark.django_db
def test_delivery_completion_is_blocked_before_financial_mutation(
    patient,
    pharmacy,
):
    agent = _create_agent()
    order = _make_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=agent,
        status=OrderStatus.OUT_FOR_DELIVERY,
    )

    payment = Payment.objects.create(
        order=order,
        provider=PaymentProvider(order.payment_method),
        amount=order.grand_total,
        status=PaymentStatus.PENDING,
    )

    issued = issue_delivery_pin(
        order_id=order.id,
        customer=patient,
    )
    _make_incident(order=order, agent=agent)

    with pytest.raises(
        ValidationError,
        match="unresolved incident",
    ):
        complete_delivery(
            order_id=order.id,
            agent=agent,
            pin=issued["pin"],
            latitude=33.5731,
            longitude=-7.5898,
            cash_confirmed=True,
        )

    order.refresh_from_db()
    payment.refresh_from_db()
    verification = DeliveryVerification.objects.get(
        order=order,
        verification_type=DeliveryVerificationType.DELIVERY,
    )

    assert order.status == OrderStatus.OUT_FOR_DELIVERY
    assert payment.status == PaymentStatus.PENDING
    assert verification.used_at is None
    assert verification.failed_attempts == 0
    assert not AgentCashTransaction.objects.filter(
        order=order,
    ).exists()


def test_guard_message_is_stable():
    assert UNRESOLVED_DELIVERY_INCIDENT_MESSAGE == (
        "This delivery has an unresolved incident. "
        "Resolve the incident before continuing."
    )

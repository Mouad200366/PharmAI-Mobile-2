from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.core.constants import UserRole
from apps.delivery.models import (
    DeliveryIncident,
    DeliveryIncidentReason,
    DeliveryIncidentStatus,
)
from apps.delivery.services.incident_resolution import (
    require_incident_return,
    resolve_incident_continue,
    start_incident_return,
)
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


def _create_incident(*, order, agent):
    return DeliveryIncident.objects.create(
        order=order,
        agent=agent,
        reason=DeliveryIncidentReason.CUSTOMER_UNREACHABLE,
        status=DeliveryIncidentStatus.OPEN,
        reported_order_status=order.status,
        details="Customer did not answer.",
    )


@pytest.fixture
def resolution_agent(db):
    return _create_delivery_agent(
        phone="+212600860001",
        email="incident.resolution@example.com",
        cin="RS123451",
        first_name="Resolver",
    )


@pytest.mark.django_db
def test_resolve_incident_continue_closes_incident_without_changing_order(
    resolution_agent,
    patient,
    pharmacy,
):
    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=resolution_agent,
        status=OrderStatus.OUT_FOR_DELIVERY,
    )
    incident = _create_incident(
        order=order,
        agent=resolution_agent,
    )

    resolved = resolve_incident_continue(
        incident_id=incident.id,
        resolution_note="  Customer answered. Continue delivery.  ",
    )

    order.refresh_from_db()

    assert resolved.status == DeliveryIncidentStatus.RESOLVED_CONTINUE
    assert resolved.resolution_note == "Customer answered. Continue delivery."
    assert resolved.resolved_at is not None
    assert order.status == OrderStatus.OUT_FOR_DELIVERY


@pytest.mark.django_db
def test_require_incident_return_marks_return_required_without_failing_order(
    resolution_agent,
    patient,
    pharmacy,
):
    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=resolution_agent,
        status=OrderStatus.OUT_FOR_DELIVERY,
    )
    incident = _create_incident(
        order=order,
        agent=resolution_agent,
    )

    updated = require_incident_return(
        incident_id=incident.id,
        resolution_note="Customer refused the package.",
    )

    order.refresh_from_db()

    assert updated.status == DeliveryIncidentStatus.RETURN_REQUIRED
    assert updated.resolution_note == "Customer refused the package."
    assert updated.resolved_at is None
    assert order.status == OrderStatus.OUT_FOR_DELIVERY


@pytest.mark.django_db
def test_assigned_agent_can_start_required_return(
    resolution_agent,
    patient,
    pharmacy,
):
    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=resolution_agent,
        status=OrderStatus.OUT_FOR_DELIVERY,
    )
    incident = _create_incident(
        order=order,
        agent=resolution_agent,
    )

    require_incident_return(
        incident_id=incident.id,
        resolution_note="Return package to pharmacy.",
    )

    returning = start_incident_return(
        incident_id=incident.id,
        agent=resolution_agent,
    )

    order.refresh_from_db()

    assert returning.status == DeliveryIncidentStatus.RETURNING
    assert order.status == OrderStatus.OUT_FOR_DELIVERY


@pytest.mark.django_db
def test_unassigned_agent_cannot_start_return(
    resolution_agent,
    patient,
    pharmacy,
):
    other_agent = _create_delivery_agent(
        phone="+212600860002",
        email="incident.resolution.other@example.com",
        cin="RS123452",
        first_name="OtherResolver",
    )

    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=resolution_agent,
        status=OrderStatus.OUT_FOR_DELIVERY,
    )
    incident = _create_incident(
        order=order,
        agent=resolution_agent,
    )

    require_incident_return(
        incident_id=incident.id,
    )

    with pytest.raises(PermissionDenied):
        start_incident_return(
            incident_id=incident.id,
            agent=other_agent,
        )

    incident.refresh_from_db()

    assert incident.status == DeliveryIncidentStatus.RETURN_REQUIRED


@pytest.mark.django_db
def test_invalid_incident_resolution_transitions_are_rejected(
    resolution_agent,
    patient,
    pharmacy,
):
    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=resolution_agent,
        status=OrderStatus.OUT_FOR_DELIVERY,
    )
    incident = _create_incident(
        order=order,
        agent=resolution_agent,
    )

    resolve_incident_continue(
        incident_id=incident.id,
    )

    with pytest.raises(ValidationError):
        require_incident_return(
            incident_id=incident.id,
        )

    with pytest.raises(ValidationError):
        start_incident_return(
            incident_id=incident.id,
            agent=resolution_agent,
        )

    incident.refresh_from_db()

    assert incident.status == DeliveryIncidentStatus.RESOLVED_CONTINUE

@pytest.mark.django_db
def test_pre_pickup_release_cancels_assignment_financials_and_redispatches(
    monkeypatch,
    resolution_agent,
    patient,
    pharmacy,
):
    from decimal import Decimal

    from apps.delivery.models import (
        DeliveryEarning,
        DeliveryEarningStatus,
        DeliveryOffer,
        DeliveryOfferStatus,
    )
    from apps.delivery.services.incident_resolution import (
        release_pre_pickup_incident,
    )

    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=resolution_agent,
        status=OrderStatus.AWAITING_AGENT,
    )

    accepted_offer = DeliveryOffer.objects.create(
        order=order,
        agent=resolution_agent,
        status=DeliveryOfferStatus.ACCEPTED,
        expires_at=timezone.now() + timedelta(seconds=20),
        earning_amount=Decimal("15.00"),
    )

    earning = DeliveryEarning.objects.create(
        order=order,
        agent=resolution_agent,
        amount=Decimal("15.00"),
        status=DeliveryEarningStatus.PENDING,
    )

    incident = _create_incident(
        order=order,
        agent=resolution_agent,
    )

    broadcasts = []
    redispatches = []

    monkeypatch.setattr(
        "apps.delivery.services.incident_resolution."
        "broadcast_delivery_assignment_updated",
        lambda *, agent_id, order_id: broadcasts.append(
            (agent_id, order_id)
        ),
    )
    monkeypatch.setattr(
        "apps.delivery.services.offers._redispatch",
        lambda redispatch_order: redispatches.append(
            redispatch_order.id
        ),
    )

    resolved = release_pre_pickup_incident(
        incident_id=incident.id,
        resolution_note="Release courier and redispatch.",
    )

    order.refresh_from_db()
    accepted_offer.refresh_from_db()
    earning.refresh_from_db()
    incident.refresh_from_db()

    assert resolved.id == incident.id
    assert incident.status == DeliveryIncidentStatus.RESOLVED
    assert incident.resolution_note == "Release courier and redispatch."
    assert incident.resolved_at is not None

    assert order.status == OrderStatus.AWAITING_AGENT
    assert order.delivery_agent_id is None

    assert accepted_offer.status == DeliveryOfferStatus.CANCELLED
    assert accepted_offer.responded_at is not None

    assert earning.status == DeliveryEarningStatus.CANCELLED

    assert broadcasts == [
        (resolution_agent.id, order.id),
    ]
    assert redispatches == [order.id]


@pytest.mark.django_db
def test_pre_pickup_release_rejects_post_pickup_incident(
    monkeypatch,
    resolution_agent,
    patient,
    pharmacy,
):
    from apps.delivery.services.incident_resolution import (
        release_pre_pickup_incident,
    )

    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=resolution_agent,
        status=OrderStatus.OUT_FOR_DELIVERY,
    )
    incident = _create_incident(
        order=order,
        agent=resolution_agent,
    )

    monkeypatch.setattr(
        "apps.delivery.services.incident_resolution."
        "broadcast_delivery_assignment_updated",
        lambda **kwargs: pytest.fail(
            "Post-pickup rejection must not broadcast."
        ),
    )

    with pytest.raises(
        ValidationError,
        match="Only a pre-pickup delivery incident",
    ):
        release_pre_pickup_incident(
            incident_id=incident.id,
        )

    order.refresh_from_db()
    incident.refresh_from_db()

    assert order.delivery_agent_id == resolution_agent.id
    assert order.status == OrderStatus.OUT_FOR_DELIVERY
    assert incident.status == DeliveryIncidentStatus.OPEN


@pytest.mark.django_db
@pytest.mark.parametrize(
    "earning_status",
    (
        "earned",
        "paid",
    ),
)
def test_pre_pickup_release_rejects_earned_or_paid_earning(
    earning_status,
    monkeypatch,
    resolution_agent,
    patient,
    pharmacy,
):
    from decimal import Decimal

    from apps.delivery.models import (
        DeliveryEarning,
        DeliveryOffer,
        DeliveryOfferStatus,
    )
    from apps.delivery.services.incident_resolution import (
        release_pre_pickup_incident,
    )

    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=resolution_agent,
        status=OrderStatus.AWAITING_AGENT,
    )

    accepted_offer = DeliveryOffer.objects.create(
        order=order,
        agent=resolution_agent,
        status=DeliveryOfferStatus.ACCEPTED,
        expires_at=timezone.now() + timedelta(seconds=20),
        earning_amount=Decimal("15.00"),
    )

    earning = DeliveryEarning.objects.create(
        order=order,
        agent=resolution_agent,
        amount=Decimal("15.00"),
        status=earning_status,
    )

    incident = _create_incident(
        order=order,
        agent=resolution_agent,
    )

    monkeypatch.setattr(
        "apps.delivery.services.incident_resolution."
        "broadcast_delivery_assignment_updated",
        lambda **kwargs: pytest.fail(
            "Rejected release must not broadcast."
        ),
    )

    with pytest.raises(
        ValidationError,
        match="delivery earning cannot be cancelled",
    ):
        release_pre_pickup_incident(
            incident_id=incident.id,
        )

    order.refresh_from_db()
    accepted_offer.refresh_from_db()
    earning.refresh_from_db()
    incident.refresh_from_db()

    assert order.delivery_agent_id == resolution_agent.id
    assert order.status == OrderStatus.AWAITING_AGENT
    assert accepted_offer.status == DeliveryOfferStatus.ACCEPTED
    assert earning.status == earning_status
    assert incident.status == DeliveryIncidentStatus.OPEN


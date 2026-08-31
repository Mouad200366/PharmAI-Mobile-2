from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point

from apps.core.constants import UserRole
from apps.delivery.models import (
    DeliveryIncident,
    DeliveryIncidentReason,
    DeliveryIncidentStatus,
)
from apps.orders.constants import OrderStatus, PaymentMethod
from apps.orders.models import Order
from apps.orders.serializers import CustomerOrderSerializer


User = get_user_model()


def _create_delivery_agent():
    return User.objects.create_user(
        phone="+212600851001",
        password="StrongPass123!",
        email="customer.incident.agent@example.com",
        cin="CI851001",
        first_name="CustomerIncident",
        last_name="Courier",
        date_of_birth=date(1993, 1, 1),
        gender="M",
        role=UserRole.DELIVERY,
        is_phone_verified=True,
    )


def _create_order(*, patient, pharmacy, agent):
    return Order.objects.create(
        customer=patient,
        pharmacy=pharmacy,
        delivery_agent=agent,
        delivery_address="Maarif, Casablanca",
        delivery_location=Point(-7.6320, 33.5860, srid=4326),
        items_total=Decimal("50.00"),
        delivery_fee=Decimal("15.00"),
        grand_total=Decimal("65.00"),
        status=OrderStatus.OUT_FOR_DELIVERY,
        payment_method=PaymentMethod.CASH,
    )


@pytest.mark.django_db
def test_customer_serializer_has_no_incident_summary_without_active_incident(
    patient,
    pharmacy,
):
    agent = _create_delivery_agent()
    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=agent,
    )

    data = CustomerOrderSerializer(order).data

    assert data["delivery_incident"] is None


@pytest.mark.django_db
def test_customer_serializer_exposes_only_safe_active_incident_fields(
    patient,
    pharmacy,
):
    agent = _create_delivery_agent()
    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=agent,
    )
    incident = DeliveryIncident.objects.create(
        order=order,
        agent=agent,
        reason=DeliveryIncidentReason.AGENT_EMERGENCY,
        reported_order_status=order.status,
        details="Private courier detail that must never reach the patient.",
        resolution_note="Internal supervisor note.",
    )

    summary = CustomerOrderSerializer(order).data["delivery_incident"]

    assert summary is not None
    assert summary["id"] == incident.id
    assert summary["status"] == DeliveryIncidentStatus.OPEN
    assert set(summary) == {
        "id",
        "status",
        "created_at",
        "updated_at",
    }
    assert "reason" not in summary
    assert "details" not in summary
    assert "resolution_note" not in summary
    assert "agent" not in summary


@pytest.mark.django_db
@pytest.mark.parametrize(
    "incident_status",
    [
        DeliveryIncidentStatus.RETURN_REQUIRED,
        DeliveryIncidentStatus.RETURNING,
        DeliveryIncidentStatus.RETURNED,
    ],
)
def test_customer_serializer_exposes_return_progress(
    patient,
    pharmacy,
    incident_status,
):
    agent = _create_delivery_agent()
    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=agent,
    )
    DeliveryIncident.objects.create(
        order=order,
        agent=agent,
        reason=DeliveryIncidentReason.PACKAGE_DAMAGED,
        status=incident_status,
        reported_order_status=order.status,
    )

    summary = CustomerOrderSerializer(order).data["delivery_incident"]

    assert summary is not None
    assert summary["status"] == incident_status


@pytest.mark.django_db
@pytest.mark.parametrize(
    "incident_status",
    [
        DeliveryIncidentStatus.RESOLVED_CONTINUE,
        DeliveryIncidentStatus.RESOLVED,
    ],
)
def test_customer_serializer_hides_resolved_incidents(
    patient,
    pharmacy,
    incident_status,
):
    agent = _create_delivery_agent()
    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=agent,
    )
    DeliveryIncident.objects.create(
        order=order,
        agent=agent,
        reason=DeliveryIncidentReason.PAYMENT_ISSUE,
        status=incident_status,
        reported_order_status=order.status,
    )

    data = CustomerOrderSerializer(order).data

    assert data["delivery_incident"] is None

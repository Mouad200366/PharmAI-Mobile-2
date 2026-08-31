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


def _create_agent():
    return User.objects.create_user(
        phone="+212600852001",
        password="StrongPass123!",
        email="patient.courier.identity@example.com",
        cin="PC852001",
        first_name="Amine",
        last_name="Livreur",
        date_of_birth=date(1993, 1, 1),
        gender="M",
        role=UserRole.DELIVERY,
        is_phone_verified=True,
    )


def _create_order(*, patient, pharmacy, agent=None):
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
def test_customer_serializer_has_null_courier_name_before_assignment(
    patient,
    pharmacy,
):
    order = _create_order(patient=patient, pharmacy=pharmacy)
    data = CustomerOrderSerializer(order).data
    assert data["delivery_agent_name"] is None


@pytest.mark.django_db
def test_customer_serializer_exposes_only_assigned_courier_display_name(
    patient,
    pharmacy,
):
    agent = _create_agent()
    order = _create_order(patient=patient, pharmacy=pharmacy, agent=agent)
    data = CustomerOrderSerializer(order).data

    assert data["delivery_agent_name"] == agent.full_name
    assert "delivery_agent" not in data
    assert "delivery_agent_phone" not in data
    assert "delivery_agent_email" not in data
    assert "delivery_agent_cin" not in data


@pytest.mark.django_db
def test_customer_serializer_hides_courier_identity_during_active_incident(
    patient,
    pharmacy,
):
    agent = _create_agent()
    order = _create_order(patient=patient, pharmacy=pharmacy, agent=agent)
    DeliveryIncident.objects.create(
        order=order,
        agent=agent,
        reason=DeliveryIncidentReason.CUSTOMER_UNREACHABLE,
        reported_order_status=order.status,
        details="Private operational detail.",
    )

    data = CustomerOrderSerializer(order).data

    assert data["delivery_incident"]["status"] == DeliveryIncidentStatus.OPEN
    assert data["delivery_agent_name"] is None


@pytest.mark.django_db
def test_customer_serializer_restores_courier_identity_after_continue_resolution(
    patient,
    pharmacy,
):
    agent = _create_agent()
    order = _create_order(patient=patient, pharmacy=pharmacy, agent=agent)
    DeliveryIncident.objects.create(
        order=order,
        agent=agent,
        reason=DeliveryIncidentReason.CUSTOMER_UNREACHABLE,
        status=DeliveryIncidentStatus.RESOLVED_CONTINUE,
        reported_order_status=order.status,
    )

    data = CustomerOrderSerializer(order).data

    assert data["delivery_incident"] is None
    assert data["delivery_agent_name"] == agent.full_name

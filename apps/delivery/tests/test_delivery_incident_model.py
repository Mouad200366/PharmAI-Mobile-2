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


@pytest.fixture
def incident_agent(db):
    return _create_delivery_agent(
        phone="+212600840001",
        email="incident.agent@example.com",
        cin="IN123451",
        first_name="Incident",
    )


@pytest.mark.django_db
def test_delivery_incident_defaults_to_open(
    incident_agent,
    patient,
    pharmacy,
):
    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=incident_agent,
        status=OrderStatus.OUT_FOR_DELIVERY,
    )

    incident = DeliveryIncident.objects.create(
        order=order,
        agent=incident_agent,
        reason=DeliveryIncidentReason.CUSTOMER_UNREACHABLE,
        reported_order_status=order.status,
        details="Customer did not answer.",
    )

    assert incident.status == DeliveryIncidentStatus.OPEN
    assert incident.reported_order_status == OrderStatus.OUT_FOR_DELIVERY
    assert incident.resolved_at is None
    assert incident.resolution_note == ""


@pytest.mark.django_db
def test_delivery_incident_keeps_reported_order_status_snapshot(
    incident_agent,
    patient,
    pharmacy,
):
    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=incident_agent,
        status=OrderStatus.PICKED_UP,
    )

    incident = DeliveryIncident.objects.create(
        order=order,
        agent=incident_agent,
        reason=DeliveryIncidentReason.PACKAGE_DAMAGED,
        reported_order_status=order.status,
    )

    order.status = OrderStatus.OUT_FOR_DELIVERY
    order.save(
        update_fields=(
            "status",
            "updated_at",
        ),
    )

    incident.refresh_from_db()

    assert incident.reported_order_status == OrderStatus.PICKED_UP
    assert incident.order.status == OrderStatus.OUT_FOR_DELIVERY


@pytest.mark.django_db
def test_delivery_incident_relations_are_scoped_correctly(
    incident_agent,
    patient,
    pharmacy,
):
    other_agent = _create_delivery_agent(
        phone="+212600840002",
        email="incident.other@example.com",
        cin="IN123452",
        first_name="OtherIncident",
    )

    first_order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=incident_agent,
        status=OrderStatus.OUT_FOR_DELIVERY,
    )
    second_order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=other_agent,
        status=OrderStatus.OUT_FOR_DELIVERY,
    )

    first_incident = DeliveryIncident.objects.create(
        order=first_order,
        agent=incident_agent,
        reason=DeliveryIncidentReason.PAYMENT_ISSUE,
        reported_order_status=first_order.status,
    )

    DeliveryIncident.objects.create(
        order=second_order,
        agent=other_agent,
        reason=DeliveryIncidentReason.WRONG_ADDRESS,
        reported_order_status=second_order.status,
    )

    assert list(
        first_order.delivery_incidents.values_list(
            "id",
            flat=True,
        )
    ) == [first_incident.id]

    assert list(
        incident_agent.delivery_incidents.values_list(
            "id",
            flat=True,
        )
    ) == [first_incident.id]


@pytest.mark.django_db
def test_delivery_incident_choices_include_return_flow():
    assert DeliveryIncidentReason.CUSTOMER_REFUSED == "customer_refused"
    assert DeliveryIncidentReason.DELIVERY_PIN_ISSUE == "delivery_pin_issue"
    assert DeliveryIncidentReason.UNSAFE_SITUATION == "unsafe_situation"

    assert DeliveryIncidentStatus.RETURN_REQUIRED == "return_required"
    assert DeliveryIncidentStatus.RETURNING == "returning"
    assert DeliveryIncidentStatus.RETURNED == "returned"
    assert DeliveryIncidentStatus.RESOLVED == "resolved"
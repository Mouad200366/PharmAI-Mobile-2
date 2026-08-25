from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.core.constants import UserRole
from apps.delivery.models import (
    DeliveryIncident,
    DeliveryIncidentReason,
    DeliveryIncidentStatus,
)
from apps.delivery.services.incident_reporting import report_delivery_incident
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
def incident_reporting_agent(db):
    return _create_delivery_agent(
        phone="+212600850001",
        email="incident.reporting@example.com",
        cin="IR123451",
        first_name="Reporter",
    )


@pytest.mark.django_db
def test_report_incident_creates_open_snapshot_without_changing_order(
    incident_reporting_agent,
    patient,
    pharmacy,
):
    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=incident_reporting_agent,
        status=OrderStatus.OUT_FOR_DELIVERY,
    )

    incident = report_delivery_incident(
        order_id=order.id,
        agent=incident_reporting_agent,
        reason=DeliveryIncidentReason.CUSTOMER_UNREACHABLE,
        details="  Customer did not answer the phone.  ",
    )

    order.refresh_from_db()

    assert incident.order_id == order.id
    assert incident.agent_id == incident_reporting_agent.id
    assert incident.status == DeliveryIncidentStatus.OPEN
    assert incident.reported_order_status == OrderStatus.OUT_FOR_DELIVERY
    assert incident.details == "Customer did not answer the phone."
    assert order.status == OrderStatus.OUT_FOR_DELIVERY


@pytest.mark.django_db
def test_report_incident_rejects_unassigned_agent(
    incident_reporting_agent,
    patient,
    pharmacy,
):
    assigned_agent = _create_delivery_agent(
        phone="+212600850002",
        email="incident.assigned@example.com",
        cin="IR123452",
        first_name="Assigned",
    )

    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=assigned_agent,
        status=OrderStatus.OUT_FOR_DELIVERY,
    )

    with pytest.raises(PermissionDenied):
        report_delivery_incident(
            order_id=order.id,
            agent=incident_reporting_agent,
            reason=DeliveryIncidentReason.WRONG_ADDRESS,
        )

    assert DeliveryIncident.objects.filter(
        order=order,
    ).count() == 0


@pytest.mark.django_db
def test_report_incident_rejects_non_delivery_stage(
    incident_reporting_agent,
    patient,
    pharmacy,
):
    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=incident_reporting_agent,
        status=OrderStatus.DELIVERED,
    )

    with pytest.raises(ValidationError):
        report_delivery_incident(
            order_id=order.id,
            agent=incident_reporting_agent,
            reason=DeliveryIncidentReason.OTHER,
        )

    assert DeliveryIncident.objects.filter(
        order=order,
    ).count() == 0


@pytest.mark.django_db
def test_report_incident_rejects_second_unresolved_incident(
    incident_reporting_agent,
    patient,
    pharmacy,
):
    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=incident_reporting_agent,
        status=OrderStatus.OUT_FOR_DELIVERY,
    )

    first = report_delivery_incident(
        order_id=order.id,
        agent=incident_reporting_agent,
        reason=DeliveryIncidentReason.PAYMENT_ISSUE,
    )

    with pytest.raises(ValidationError):
        report_delivery_incident(
            order_id=order.id,
            agent=incident_reporting_agent,
            reason=DeliveryIncidentReason.CUSTOMER_REFUSED,
        )

    assert first.status == DeliveryIncidentStatus.OPEN
    assert DeliveryIncident.objects.filter(
        order=order,
    ).count() == 1


@pytest.mark.django_db
def test_report_incident_rejects_invalid_reason(
    incident_reporting_agent,
    patient,
    pharmacy,
):
    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=incident_reporting_agent,
        status=OrderStatus.PICKED_UP,
    )

    with pytest.raises(ValidationError):
        report_delivery_incident(
            order_id=order.id,
            agent=incident_reporting_agent,
            reason="not_a_real_reason",
        )

    assert DeliveryIncident.objects.filter(
        order=order,
    ).count() == 0
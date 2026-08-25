from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.contrib.gis.geos import Point
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.constants import UserRole
from apps.delivery.models import (
    DeliveryIncident,
    DeliveryIncidentReason,
    DeliveryIncidentStatus,
    DeliveryVerification,
    DeliveryVerificationType,
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
def api_client():
    return APIClient()


@pytest.fixture
def incident_api_agent(db):
    return _create_delivery_agent(
        phone="+212600890001",
        email="incident.api.agent@example.com",
        cin="IA123451",
        first_name="IncidentAPI",
    )


@pytest.mark.django_db
def test_delivery_agent_can_report_incident_without_changing_order(
    api_client,
    incident_api_agent,
    patient,
    pharmacy,
):
    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=incident_api_agent,
        status=OrderStatus.OUT_FOR_DELIVERY,
    )

    api_client.force_authenticate(
        user=incident_api_agent,
    )

    response = api_client.post(
        reverse(
            "v1:delivery-incident-report",
            kwargs={"order_id": order.id},
        ),
        {
            "reason": DeliveryIncidentReason.CUSTOMER_UNREACHABLE,
            "details": "Customer is not answering.",
        },
        format="json",
    )

    assert response.status_code == 201
    assert response.data["order_id"] == order.id
    assert response.data["agent_id"] == incident_api_agent.id
    assert response.data["reason"] == DeliveryIncidentReason.CUSTOMER_UNREACHABLE
    assert response.data["status"] == DeliveryIncidentStatus.OPEN

    assert "customer" not in response.data
    assert "delivery_address" not in response.data
    assert "medicine" not in response.data
    assert "prescription" not in response.data

    order.refresh_from_db()

    assert order.status == OrderStatus.OUT_FOR_DELIVERY


@pytest.mark.django_db
def test_delivery_agent_can_read_current_incident(
    api_client,
    incident_api_agent,
    patient,
    pharmacy,
):
    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=incident_api_agent,
        status=OrderStatus.OUT_FOR_DELIVERY,
    )

    incident = DeliveryIncident.objects.create(
        order=order,
        agent=incident_api_agent,
        reason=DeliveryIncidentReason.PAYMENT_ISSUE,
        status=DeliveryIncidentStatus.OPEN,
        reported_order_status=order.status,
    )

    api_client.force_authenticate(
        user=incident_api_agent,
    )

    response = api_client.get(
        reverse(
            "v1:delivery-incident-current",
            kwargs={"order_id": order.id},
        ),
    )

    assert response.status_code == 200
    assert response.data["incident"]["id"] == incident.id
    assert response.data["incident"]["status"] == DeliveryIncidentStatus.OPEN


@pytest.mark.django_db
def test_delivery_agent_can_start_approved_return(
    api_client,
    incident_api_agent,
    patient,
    pharmacy,
):
    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=incident_api_agent,
        status=OrderStatus.OUT_FOR_DELIVERY,
    )

    incident = DeliveryIncident.objects.create(
        order=order,
        agent=incident_api_agent,
        reason=DeliveryIncidentReason.CUSTOMER_REFUSED,
        status=DeliveryIncidentStatus.RETURN_REQUIRED,
        reported_order_status=order.status,
        resolution_note="Return package to pharmacy.",
    )

    api_client.force_authenticate(
        user=incident_api_agent,
    )

    response = api_client.post(
        reverse(
            "v1:delivery-incident-return-start",
            kwargs={"incident_id": incident.id},
        ),
        {},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["status"] == DeliveryIncidentStatus.RETURNING

    order.refresh_from_db()

    assert order.status == OrderStatus.OUT_FOR_DELIVERY


@pytest.mark.django_db
def test_delivery_agent_can_verify_physical_return_with_pin(
    api_client,
    incident_api_agent,
    patient,
    pharmacy,
):
    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=incident_api_agent,
        status=OrderStatus.OUT_FOR_DELIVERY,
    )

    incident = DeliveryIncident.objects.create(
        order=order,
        agent=incident_api_agent,
        reason=DeliveryIncidentReason.CUSTOMER_REFUSED,
        status=DeliveryIncidentStatus.RETURNING,
        reported_order_status=order.status,
    )

    verification = DeliveryVerification.objects.create(
        order=order,
        verification_type=DeliveryVerificationType.RETURN,
        pin_hash=make_password("654321"),
        qr_token_hash=make_password("return-qr-token"),
        expires_at=timezone.now() + timedelta(minutes=30),
    )

    api_client.force_authenticate(
        user=incident_api_agent,
    )

    response = api_client.post(
        reverse(
            "v1:delivery-incident-return-verify",
            kwargs={"incident_id": incident.id},
        ),
        {
            "credential": "654321",
            "method": "pin",
            "latitude": 33.5731,
            "longitude": -7.5898,
        },
        format="json",
    )

    assert response.status_code == 200
    assert response.data["status"] == DeliveryIncidentStatus.RETURNED

    verification.refresh_from_db()
    order.refresh_from_db()

    assert verification.used_at is not None
    assert verification.verified_by_id == incident_api_agent.id
    assert verification.verified_location is not None
    assert order.status == OrderStatus.OUT_FOR_DELIVERY


@pytest.mark.django_db
def test_current_incident_returns_none_when_no_active_incident(
    api_client,
    incident_api_agent,
    patient,
    pharmacy,
):
    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=incident_api_agent,
        status=OrderStatus.OUT_FOR_DELIVERY,
    )

    DeliveryIncident.objects.create(
        order=order,
        agent=incident_api_agent,
        reason=DeliveryIncidentReason.CUSTOMER_UNREACHABLE,
        status=DeliveryIncidentStatus.RESOLVED_CONTINUE,
        reported_order_status=order.status,
        resolved_at=timezone.now(),
    )

    api_client.force_authenticate(
        user=incident_api_agent,
    )

    response = api_client.get(
        reverse(
            "v1:delivery-incident-current",
            kwargs={"order_id": order.id},
        ),
    )

    assert response.status_code == 200
    assert response.data == {
        "incident": None,
    }


@pytest.mark.django_db
def test_patient_cannot_access_delivery_incident_endpoints(
    api_client,
    patient,
):
    api_client.force_authenticate(
        user=patient,
    )

    urls = (
        reverse(
            "v1:delivery-incident-report",
            kwargs={"order_id": 999999},
        ),
        reverse(
            "v1:delivery-incident-current",
            kwargs={"order_id": 999999},
        ),
        reverse(
            "v1:delivery-incident-return-start",
            kwargs={"incident_id": 999999},
        ),
        reverse(
            "v1:delivery-incident-return-verify",
            kwargs={"incident_id": 999999},
        ),
    )

    responses = (
        api_client.post(
            urls[0],
            {
                "reason": DeliveryIncidentReason.OTHER,
            },
            format="json",
        ),
        api_client.get(
            urls[1],
        ),
        api_client.post(
            urls[2],
            {},
            format="json",
        ),
        api_client.post(
            urls[3],
            {
                "credential": "123456",
                "method": "pin",
                "latitude": 33.5731,
                "longitude": -7.5898,
            },
            format="json",
        ),
    )

    assert all(
        response.status_code == 403
        for response in responses
    )
from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point
from django.urls import reverse
from rest_framework.test import APIClient

from apps.core.constants import UserRole
from apps.delivery.models import (
    DeliveryVerification,
    DeliveryVerificationMethod,
    DeliveryVerificationType,
)
from apps.delivery.services.pickup import issue_pickup_verification
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


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def pickup_api_agent(db):
    return _create_delivery_agent(
        phone="+212600720001",
        email="pickup.api.agent@example.com",
        cin="PA123451",
        first_name="PickupAPI",
    )


@pytest.fixture
def other_pickup_api_agent(db):
    return _create_delivery_agent(
        phone="+212600720002",
        email="pickup.api.other@example.com",
        cin="PA123452",
        first_name="OtherAPI",
    )


@pytest.fixture
def pickup_api_order(patient, pharmacy, pickup_api_agent):
    return Order.objects.create(
        customer=patient,
        pharmacy=pharmacy,
        delivery_agent=pickup_api_agent,
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
def test_assigned_agent_can_verify_pickup_with_pin(
    api_client,
    pickup_api_order,
    pickup_api_agent,
):
    issued = issue_pickup_verification(
        order=pickup_api_order,
    )

    api_client.force_authenticate(
        user=pickup_api_agent,
    )

    url = reverse(
        "v1:order-verify-pickup",
        kwargs={"pk": pickup_api_order.id},
    )

    response = api_client.post(
        url,
        {
            "method": DeliveryVerificationMethod.PIN,
            "credential": issued["pin"],
            "latitude": 33.5731,
            "longitude": -7.5898,
        },
        format="json",
    )

    assert response.status_code == 200

    pickup_api_order.refresh_from_db()

    verification = DeliveryVerification.objects.get(
        order=pickup_api_order,
        verification_type=DeliveryVerificationType.PICKUP,
    )

    assert pickup_api_order.status == OrderStatus.PICKED_UP
    assert verification.used_at is not None
    assert verification.verified_by_id == pickup_api_agent.id
    assert verification.verification_method == DeliveryVerificationMethod.PIN


@pytest.mark.django_db
def test_invalid_pin_returns_400_and_counts_failed_attempt(
    api_client,
    pickup_api_order,
    pickup_api_agent,
):
    issue_pickup_verification(
        order=pickup_api_order,
    )

    api_client.force_authenticate(
        user=pickup_api_agent,
    )

    url = reverse(
        "v1:order-verify-pickup",
        kwargs={"pk": pickup_api_order.id},
    )

    response = api_client.post(
        url,
        {
            "method": DeliveryVerificationMethod.PIN,
            "credential": "999999",
            "latitude": 33.5731,
            "longitude": -7.5898,
        },
        format="json",
    )

    assert response.status_code == 400

    pickup_api_order.refresh_from_db()

    verification = DeliveryVerification.objects.get(
        order=pickup_api_order,
        verification_type=DeliveryVerificationType.PICKUP,
    )

    assert pickup_api_order.status == OrderStatus.AWAITING_AGENT
    assert verification.failed_attempts == 1
    assert verification.used_at is None


@pytest.mark.django_db
def test_other_delivery_agent_cannot_access_pickup_endpoint(
    api_client,
    pickup_api_order,
    other_pickup_api_agent,
):
    issued = issue_pickup_verification(
        order=pickup_api_order,
    )

    api_client.force_authenticate(
        user=other_pickup_api_agent,
    )

    url = reverse(
        "v1:order-verify-pickup",
        kwargs={"pk": pickup_api_order.id},
    )

    response = api_client.post(
        url,
        {
            "method": DeliveryVerificationMethod.PIN,
            "credential": issued["pin"],
            "latitude": 33.5731,
            "longitude": -7.5898,
        },
        format="json",
    )

    assert response.status_code == 404

    pickup_api_order.refresh_from_db()
    assert pickup_api_order.status == OrderStatus.AWAITING_AGENT


@pytest.mark.django_db
def test_patient_cannot_verify_pickup(
    api_client,
    pickup_api_order,
    patient,
):
    issued = issue_pickup_verification(
        order=pickup_api_order,
    )

    api_client.force_authenticate(
        user=patient,
    )

    url = reverse(
        "v1:order-verify-pickup",
        kwargs={"pk": pickup_api_order.id},
    )

    response = api_client.post(
        url,
        {
            "method": DeliveryVerificationMethod.PIN,
            "credential": issued["pin"],
            "latitude": 33.5731,
            "longitude": -7.5898,
        },
        format="json",
    )

    assert response.status_code == 403

    pickup_api_order.refresh_from_db()
    assert pickup_api_order.status == OrderStatus.AWAITING_AGENT


@pytest.mark.django_db
def test_pickup_endpoint_rejects_invalid_method(
    api_client,
    pickup_api_order,
    pickup_api_agent,
):
    issued = issue_pickup_verification(
        order=pickup_api_order,
    )

    api_client.force_authenticate(
        user=pickup_api_agent,
    )

    url = reverse(
        "v1:order-verify-pickup",
        kwargs={"pk": pickup_api_order.id},
    )

    response = api_client.post(
        url,
        {
            "method": "barcode",
            "credential": issued["pin"],
            "latitude": 33.5731,
            "longitude": -7.5898,
        },
        format="json",
    )

    assert response.status_code == 400

    pickup_api_order.refresh_from_db()
    assert pickup_api_order.status == OrderStatus.AWAITING_AGENT
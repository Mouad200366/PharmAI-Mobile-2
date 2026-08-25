from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point
from django.urls import reverse
from rest_framework.test import APIClient

from apps.core.constants import UserRole
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
def start_api_agent(db):
    return _create_delivery_agent(
        phone="+212600740001",
        email="start.api.agent@example.com",
        cin="SA123451",
        first_name="StartAPI",
    )


@pytest.fixture
def other_start_api_agent(db):
    return _create_delivery_agent(
        phone="+212600740002",
        email="start.api.other@example.com",
        cin="SA123452",
        first_name="OtherStartAPI",
    )


@pytest.fixture
def start_api_order(patient, pharmacy, start_api_agent):
    return Order.objects.create(
        customer=patient,
        pharmacy=pharmacy,
        delivery_agent=start_api_agent,
        delivery_address="Maarif, Casablanca",
        delivery_location=Point(
            -7.6320,
            33.5860,
            srid=4326,
        ),
        items_total=Decimal("50.00"),
        delivery_fee=Decimal("15.00"),
        grand_total=Decimal("65.00"),
        status=OrderStatus.PICKED_UP,
        payment_method=PaymentMethod.CASH,
    )


@pytest.mark.django_db
def test_assigned_agent_can_start_delivery(
    api_client,
    start_api_order,
    start_api_agent,
):
    api_client.force_authenticate(
        user=start_api_agent,
    )

    url = reverse(
        "v1:order-start-delivery",
        kwargs={"pk": start_api_order.id},
    )

    response = api_client.post(
        url,
        {},
        format="json",
    )

    assert response.status_code == 200

    start_api_order.refresh_from_db()

    assert start_api_order.status == OrderStatus.OUT_FOR_DELIVERY


@pytest.mark.django_db
def test_start_delivery_before_pickup_returns_400(
    api_client,
    start_api_order,
    start_api_agent,
):
    start_api_order.status = OrderStatus.AWAITING_AGENT
    start_api_order.save(
        update_fields=(
            "status",
            "updated_at",
        )
    )

    api_client.force_authenticate(
        user=start_api_agent,
    )

    url = reverse(
        "v1:order-start-delivery",
        kwargs={"pk": start_api_order.id},
    )

    response = api_client.post(
        url,
        {},
        format="json",
    )

    assert response.status_code == 400

    start_api_order.refresh_from_db()
    assert start_api_order.status == OrderStatus.AWAITING_AGENT


@pytest.mark.django_db
def test_other_delivery_agent_cannot_start_delivery(
    api_client,
    start_api_order,
    other_start_api_agent,
):
    api_client.force_authenticate(
        user=other_start_api_agent,
    )

    url = reverse(
        "v1:order-start-delivery",
        kwargs={"pk": start_api_order.id},
    )

    response = api_client.post(
        url,
        {},
        format="json",
    )

    assert response.status_code == 404

    start_api_order.refresh_from_db()
    assert start_api_order.status == OrderStatus.PICKED_UP


@pytest.mark.django_db
def test_patient_cannot_start_delivery(
    api_client,
    start_api_order,
    patient,
):
    api_client.force_authenticate(
        user=patient,
    )

    url = reverse(
        "v1:order-start-delivery",
        kwargs={"pk": start_api_order.id},
    )

    response = api_client.post(
        url,
        {},
        format="json",
    )

    assert response.status_code == 403

    start_api_order.refresh_from_db()
    assert start_api_order.status == OrderStatus.PICKED_UP
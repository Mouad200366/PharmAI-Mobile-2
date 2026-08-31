from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.constants import UserRole
from apps.delivery.models import DeliveryAgentProfile
from apps.orders.constants import OrderStatus, PaymentMethod
from apps.orders.models import Order


User = get_user_model()


def _create_delivery_agent():
    return User.objects.create_user(
        phone="+212600940001",
        password="StrongPass123!",
        email="live.location.agent@example.com",
        cin="LT123451",
        first_name="Live",
        last_name="Tracker",
        date_of_birth=date(1993, 1, 1),
        gender="M",
        role=UserRole.DELIVERY,
        is_phone_verified=True,
    )


def _make_active_order(*, patient, pharmacy, agent):
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
def test_rest_location_update_broadcasts_live_tracking_payload(
    patient,
    pharmacy,
    monkeypatch,
):
    agent = _create_delivery_agent()
    order = _make_active_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=agent,
    )

    profile = DeliveryAgentProfile.objects.create(
        user=agent,
        is_online=True,
        location_updated_at=timezone.now(),
    )

    calls = []

    def capture(order_id, payload):
        calls.append((order_id, payload))

    monkeypatch.setattr(
        "apps.tracking.services.broadcast.broadcast_location_update",
        capture,
    )

    client = APIClient()
    client.force_authenticate(user=agent)

    response = client.post(
        "/api/v1/delivery/location/",
        {
            "latitude": 33.5800,
            "longitude": -7.6200,
        },
        format="json",
    )

    assert response.status_code == 200

    profile.refresh_from_db()
    assert profile.current_location.y == pytest.approx(33.5800)
    assert profile.current_location.x == pytest.approx(-7.6200)
    assert profile.location_updated_at is not None

    assert len(calls) == 1
    order_id, payload = calls[0]

    assert order_id == order.id
    assert payload["order_id"] == order.id
    assert payload["agent_latitude"] == pytest.approx(33.5800)
    assert payload["agent_longitude"] == pytest.approx(-7.6200)
    assert payload["distance_to_customer_m"] >= 0
    assert payload["eta_minutes"] >= 1
    assert payload["status"] == OrderStatus.OUT_FOR_DELIVERY
    assert isinstance(payload["location_updated_at"], str)


@pytest.mark.django_db
def test_rest_location_update_without_active_order_does_not_broadcast(
    monkeypatch,
):
    agent = _create_delivery_agent()
    DeliveryAgentProfile.objects.create(
        user=agent,
        is_online=True,
        location_updated_at=timezone.now(),
    )

    calls = []

    monkeypatch.setattr(
        "apps.tracking.services.broadcast.broadcast_location_update",
        lambda order_id, payload: calls.append((order_id, payload)),
    )

    client = APIClient()
    client.force_authenticate(user=agent)

    response = client.post(
        "/api/v1/delivery/location/",
        {
            "latitude": 33.5800,
            "longitude": -7.6200,
        },
        format="json",
    )

    assert response.status_code == 200
    assert calls == []

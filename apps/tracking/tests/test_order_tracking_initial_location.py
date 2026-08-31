from datetime import date, timedelta
from decimal import Decimal

import pytest
from asgiref.sync import async_to_sync
from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point
from django.utils import timezone

from apps.core.constants import UserRole
from apps.delivery.models import DeliveryAgentProfile
from apps.orders.constants import OrderStatus, PaymentMethod
from apps.orders.models import Order
from apps.tracking.consumers import OrderTrackingConsumer


User = get_user_model()


def _create_delivery_agent():
    return User.objects.create_user(
        phone="+212600940002",
        password="StrongPass123!",
        email="initial.location.agent@example.com",
        cin="LT123452",
        first_name="Initial",
        last_name="Tracker",
        date_of_birth=date(1993, 1, 1),
        gender="M",
        role=UserRole.DELIVERY,
        is_phone_verified=True,
    )


def _make_order(*, patient, pharmacy, agent):
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


@pytest.mark.django_db(transaction=True)
def test_order_tracking_consumer_builds_fresh_initial_location(
    patient,
    pharmacy,
):
    agent = _create_delivery_agent()
    order = _make_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=agent,
    )

    DeliveryAgentProfile.objects.create(
        user=agent,
        is_online=True,
        current_location=Point(-7.6200, 33.5800, srid=4326),
        location_updated_at=timezone.now(),
    )

    consumer = OrderTrackingConsumer()
    consumer.order_id = order.id

    payload = async_to_sync(consumer._current_location_payload)()

    assert payload is not None
    assert payload["order_id"] == order.id
    assert payload["agent_latitude"] == pytest.approx(33.5800)
    assert payload["agent_longitude"] == pytest.approx(-7.6200)
    assert payload["distance_to_customer_m"] >= 0
    assert payload["eta_minutes"] >= 1
    assert payload["status"] == OrderStatus.OUT_FOR_DELIVERY
    assert isinstance(payload["location_updated_at"], str)


@pytest.mark.django_db(transaction=True)
def test_order_tracking_consumer_ignores_stale_location(
    patient,
    pharmacy,
):
    agent = _create_delivery_agent()
    order = _make_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=agent,
    )

    DeliveryAgentProfile.objects.create(
        user=agent,
        is_online=True,
        current_location=Point(-7.6200, 33.5800, srid=4326),
        location_updated_at=timezone.now() - timedelta(minutes=10),
    )

    consumer = OrderTrackingConsumer()
    consumer.order_id = order.id

    payload = async_to_sync(consumer._current_location_payload)()

    assert payload is None

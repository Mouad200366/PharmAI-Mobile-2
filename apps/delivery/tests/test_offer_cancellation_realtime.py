from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point
from django.utils import timezone

from apps.core.constants import UserRole
from apps.delivery.models import DeliveryOffer, DeliveryOfferStatus
from apps.orders.constants import OrderStatus, PaymentMethod
from apps.orders.models import Order
from apps.orders.services.state_machine import transition


User = get_user_model()


@pytest.fixture
def cancellation_agent(db):
    return User.objects.create_user(
        phone="+212600600001",
        password="StrongPass123!",
        email="delivery.cancel@example.com",
        cin="DC123456",
        first_name="Cancel",
        last_name="Courier",
        date_of_birth=date(1992, 1, 1),
        gender="M",
        role=UserRole.DELIVERY,
        is_phone_verified=True,
    )


@pytest.fixture
def cancellation_order(patient, pharmacy):
    return Order.objects.create(
        customer=patient,
        pharmacy=pharmacy,
        delivery_address="Maarif, Casablanca",
        delivery_location=Point(-7.6320, 33.5860, srid=4326),
        items_total=Decimal("50.00"),
        delivery_fee=Decimal("15.00"),
        grand_total=Decimal("65.00"),
        status=OrderStatus.AWAITING_AGENT,
        payment_method=PaymentMethod.CASH,
    )


@pytest.mark.django_db(transaction=True)
def test_order_cancellation_closes_pending_offer_and_notifies_agent(
    monkeypatch,
    cancellation_agent,
    cancellation_order,
):
    offer = DeliveryOffer.objects.create(
        order=cancellation_order,
        agent=cancellation_agent,
        expires_at=timezone.now() + timedelta(seconds=20),
        earning_amount=Decimal("15.00"),
    )

    sent = []

    def fake_broadcast(*, agent_id, offer_id):
        sent.append(
            {
                "agent_id": agent_id,
                "offer_id": offer_id,
            }
        )

    monkeypatch.setattr(
        "apps.delivery.services.offers.broadcast_delivery_offer_cancelled",
        fake_broadcast,
    )

    transition(
        cancellation_order,
        OrderStatus.CANCELLED,
        by_user=cancellation_order.customer,
        note="Customer cancelled order.",
    )

    offer.refresh_from_db()
    cancellation_order.refresh_from_db()

    assert cancellation_order.status == OrderStatus.CANCELLED
    assert offer.status == DeliveryOfferStatus.CANCELLED
    assert offer.responded_at is not None

    assert sent == [
        {
            "agent_id": cancellation_agent.id,
            "offer_id": offer.id,
        }
    ]
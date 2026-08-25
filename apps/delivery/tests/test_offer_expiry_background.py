from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point
from django.utils import timezone

from apps.core.constants import UserRole
from apps.delivery.models import (
    DeliveryAgentProfile,
    DeliveryOffer,
    DeliveryOfferStatus,
)
from apps.delivery.services.offers import expire_stale_offers
from apps.delivery.tasks import expire_stale_delivery_offers
from apps.orders.constants import OrderStatus, PaymentMethod
from apps.orders.models import Order


User = get_user_model()


def _create_delivery_agent(
    *,
    phone,
    email,
    cin,
    first_name,
    longitude,
    latitude,
):
    user = User.objects.create_user(
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

    DeliveryAgentProfile.objects.create(
        user=user,
        approved_at=timezone.now(),
        is_online=True,
        current_location=Point(
            longitude,
            latitude,
            srid=4326,
        ),
        location_updated_at=timezone.now(),
    )

    return user


@pytest.fixture
def expired_offer_agents(db):
    first_agent = _create_delivery_agent(
        phone="+212600700001",
        email="expired.first@example.com",
        cin="EX123451",
        first_name="First",
        longitude=-7.5900,
        latitude=33.5730,
    )

    second_agent = _create_delivery_agent(
        phone="+212600700002",
        email="expired.second@example.com",
        cin="EX123452",
        first_name="Second",
        longitude=-7.5920,
        latitude=33.5740,
    )

    return first_agent, second_agent


@pytest.fixture
def expiry_order(patient, pharmacy):
    return Order.objects.create(
        customer=patient,
        pharmacy=pharmacy,
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


@pytest.mark.django_db(transaction=True)
def test_expired_offer_is_closed_and_redispatched_to_next_agent(
    monkeypatch,
    expired_offer_agents,
    expiry_order,
):
    first_agent, second_agent = expired_offer_agents

    expired_offer = DeliveryOffer.objects.create(
        order=expiry_order,
        agent=first_agent,
        expires_at=timezone.now() - timedelta(seconds=1),
        earning_amount=Decimal("15.00"),
    )

    expired_events = []
    available_events = []

    def fake_expired_broadcast(*, agent_id, offer_id):
        expired_events.append(
            {
                "agent_id": agent_id,
                "offer_id": offer_id,
            }
        )

    def fake_available_broadcast(*, agent_id, offer_id):
        available_events.append(
            {
                "agent_id": agent_id,
                "offer_id": offer_id,
            }
        )

    monkeypatch.setattr(
        "apps.delivery.services.offers.broadcast_delivery_offer_expired",
        fake_expired_broadcast,
    )
    monkeypatch.setattr(
        "apps.orders.services.place_order.broadcast_delivery_offer_available",
        fake_available_broadcast,
    )

    result = expire_stale_offers()

    expired_offer.refresh_from_db()

    assert expired_offer.status == DeliveryOfferStatus.EXPIRED
    assert expired_offer.responded_at is not None

    next_offer = DeliveryOffer.objects.get(
        order=expiry_order,
        status=DeliveryOfferStatus.PENDING,
    )

    assert next_offer.agent_id == second_agent.id
    assert next_offer.agent_id != first_agent.id

    assert result == {
        "considered": 1,
        "expired": 1,
        "redispatched": 1,
    }

    assert expired_events == [
        {
            "agent_id": first_agent.id,
            "offer_id": expired_offer.id,
        }
    ]

    assert available_events == [
        {
            "agent_id": second_agent.id,
            "offer_id": next_offer.id,
        }
    ]


def test_expire_stale_delivery_offers_task_calls_service(monkeypatch):
    expected = {
        "considered": 3,
        "expired": 2,
        "redispatched": 1,
    }

    def fake_expire_stale_offers():
        return expected

    monkeypatch.setattr(
        "apps.delivery.services.offers.expire_stale_offers",
        fake_expire_stale_offers,
    )

    result = expire_stale_delivery_offers.run()

    assert result == expected
from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point
from django.utils import timezone

from apps.core.constants import UserRole
from apps.delivery.models import DeliveryAgentProfile, DeliveryOffer, DeliveryOfferStatus
from apps.delivery.services.offers import accept_offer, get_current_offer
from apps.orders.constants import OrderStatus, PaymentMethod
from apps.orders.models import Order


User = get_user_model()


@pytest.fixture
def realtime_agent(db):
    user = User.objects.create_user(
        phone="+212600500001",
        password="StrongPass123!",
        email="delivery.offer.realtime@example.com",
        cin="DR123456",
        first_name="Realtime",
        last_name="Agent",
        date_of_birth=date(1993, 1, 1),
        gender="M",
        role=UserRole.DELIVERY,
        is_phone_verified=True,
    )

    DeliveryAgentProfile.objects.create(
        user=user,
        approved_at=timezone.now(),
        is_online=True,
        current_location=Point(-7.5900, 33.5730, srid=4326),
        location_updated_at=timezone.now(),
    )

    return user


@pytest.fixture
def awaiting_order(patient, pharmacy):
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
def test_accept_offer_broadcasts_assignment_updated_after_commit(
    monkeypatch,
    realtime_agent,
    awaiting_order,
):
    offer = DeliveryOffer.objects.create(
        order=awaiting_order,
        agent=realtime_agent,
        expires_at=timezone.now() + timedelta(seconds=20),
        earning_amount=Decimal("15.00"),
    )

    sent = []

    def fake_broadcast(*, agent_id, order_id):
        sent.append(
            {
                "agent_id": agent_id,
                "order_id": order_id,
            }
        )

    monkeypatch.setattr(
        "apps.delivery.services.offers.broadcast_delivery_assignment_updated",
        fake_broadcast,
    )

    accepted = accept_offer(
        offer_id=offer.id,
        agent=realtime_agent,
    )

    assert accepted.status == DeliveryOfferStatus.ACCEPTED

    awaiting_order.refresh_from_db()
    assert awaiting_order.delivery_agent_id == realtime_agent.id

    assert sent == [
        {
            "agent_id": realtime_agent.id,
            "order_id": awaiting_order.id,
        }
    ]


@pytest.mark.django_db(transaction=True)
def test_expired_offer_broadcasts_offer_expired_after_commit(
    monkeypatch,
    realtime_agent,
    awaiting_order,
):
    offer = DeliveryOffer.objects.create(
        order=awaiting_order,
        agent=realtime_agent,
        expires_at=timezone.now() - timedelta(seconds=1),
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
        "apps.delivery.services.offers.broadcast_delivery_offer_expired",
        fake_broadcast,
    )

    current = get_current_offer(realtime_agent)

    assert current is None

    offer.refresh_from_db()
    assert offer.status == DeliveryOfferStatus.EXPIRED
    assert offer.responded_at is not None

    assert sent == [
        {
            "agent_id": realtime_agent.id,
            "offer_id": offer.id,
        }
    ]
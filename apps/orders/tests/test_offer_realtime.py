from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point
from django.utils import timezone

from apps.core.constants import UserRole
from apps.delivery.models import DeliveryAgentProfile
from apps.orders.constants import OrderStatus, PaymentMethod
from apps.orders.models import Order
from apps.orders.services.place_order import _try_assign_agent


User = get_user_model()


@pytest.fixture
def realtime_delivery_agent(db):
    return User.objects.create_user(
        phone="+212600400001",
        password="StrongPass123!",
        email="delivery.realtime@example.com",
        cin="RT123456",
        first_name="Realtime",
        last_name="Courier",
        date_of_birth=date(1994, 1, 1),
        gender="M",
        role=UserRole.DELIVERY,
        is_phone_verified=True,
    )


@pytest.fixture
def realtime_delivery_profile(realtime_delivery_agent):
    return DeliveryAgentProfile.objects.create(
        user=realtime_delivery_agent,
        approved_at=timezone.now(),
        is_online=True,
        current_location=Point(-7.5900, 33.5730, srid=4326),
        location_updated_at=timezone.now(),
    )


@pytest.fixture
def realtime_awaiting_order(patient, pharmacy):
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
def test_new_delivery_offer_broadcasts_offer_available_after_commit(
    monkeypatch,
    realtime_delivery_profile,
    realtime_awaiting_order,
):
    sent = []

    def fake_broadcast(*, agent_id, offer_id):
        sent.append(
            {
                "agent_id": agent_id,
                "offer_id": offer_id,
            }
        )

    monkeypatch.setattr(
        "apps.orders.services.place_order.broadcast_delivery_offer_available",
        fake_broadcast,
    )

    offer = _try_assign_agent(realtime_awaiting_order)

    assert offer is not None
    assert offer.agent_id == realtime_delivery_profile.user_id

    assert sent == [
        {
            "agent_id": realtime_delivery_profile.user_id,
            "offer_id": offer.id,
        }
    ]

@pytest.mark.django_db(transaction=True)
def test_new_delivery_offer_sends_push_after_commit(
    monkeypatch,
    realtime_delivery_profile,
    realtime_awaiting_order,
):
    sent = []

    def fake_push(**kwargs):
        sent.append(kwargs)
        return {
            "ok": True,
            "ticket_id": "ticket-new-offer",
            "error": None,
            "error_code": None,
        }

    monkeypatch.setattr(
        "apps.orders.services.place_order.send_push_to_user",
        fake_push,
    )
    monkeypatch.setattr(
        "apps.orders.services.place_order.broadcast_delivery_offer_available",
        lambda **kwargs: None,
    )

    offer = _try_assign_agent(realtime_awaiting_order)

    assert offer is not None
    assert len(sent) == 1
    assert sent[0]["user"].id == realtime_delivery_profile.user_id


@pytest.mark.django_db(transaction=True)
def test_new_delivery_offer_push_contains_expected_payload(
    monkeypatch,
    realtime_delivery_profile,
    realtime_awaiting_order,
):
    sent = []

    def fake_push(**kwargs):
        sent.append(kwargs)
        return {
            "ok": True,
            "ticket_id": "ticket-payload",
            "error": None,
            "error_code": None,
        }

    monkeypatch.setattr(
        "apps.orders.services.place_order.send_push_to_user",
        fake_push,
    )
    monkeypatch.setattr(
        "apps.orders.services.place_order.broadcast_delivery_offer_available",
        lambda **kwargs: None,
    )

    offer = _try_assign_agent(realtime_awaiting_order)

    assert offer is not None
    assert len(sent) == 1

    push = sent[0]

    assert push["user"].id == realtime_delivery_profile.user_id
    assert push["title"] == "New delivery offer"
    assert push["body"] == (
        "A new delivery request is available. "
        "Open PharmAI to review it."
    )
    assert push["data"] == {
        "type": "delivery_offer_available",
        "offer_id": offer.id,
        "order_id": realtime_awaiting_order.id,
    }
    assert push["priority"] == "high"


@pytest.mark.django_db(transaction=True)
def test_existing_pending_offer_does_not_send_duplicate_push(
    monkeypatch,
    realtime_delivery_profile,
    realtime_awaiting_order,
):
    sent = []

    def fake_push(**kwargs):
        sent.append(kwargs)
        return {
            "ok": True,
            "ticket_id": "ticket-once",
            "error": None,
            "error_code": None,
        }

    monkeypatch.setattr(
        "apps.orders.services.place_order.send_push_to_user",
        fake_push,
    )
    monkeypatch.setattr(
        "apps.orders.services.place_order.broadcast_delivery_offer_available",
        lambda **kwargs: None,
    )

    first_offer = _try_assign_agent(realtime_awaiting_order)

    assert first_offer is not None
    assert len(sent) == 1

    sent.clear()

    second_offer = _try_assign_agent(realtime_awaiting_order)

    assert second_offer is not None
    assert second_offer.id == first_offer.id
    assert sent == []


@pytest.mark.django_db(transaction=True)
def test_push_exception_does_not_break_committed_delivery_offer(
    monkeypatch,
    realtime_delivery_profile,
    realtime_awaiting_order,
):
    from apps.delivery.models import DeliveryOffer, DeliveryOfferStatus

    def failing_push(**kwargs):
        raise RuntimeError("simulated push provider failure")

    monkeypatch.setattr(
        "apps.orders.services.place_order.send_push_to_user",
        failing_push,
    )
    monkeypatch.setattr(
        "apps.orders.services.place_order.broadcast_delivery_offer_available",
        lambda **kwargs: None,
    )

    offer = _try_assign_agent(realtime_awaiting_order)

    assert offer is not None

    persisted = DeliveryOffer.objects.get(pk=offer.pk)

    assert persisted.status == DeliveryOfferStatus.PENDING
    assert persisted.agent_id == realtime_delivery_profile.user_id
    assert persisted.order_id == realtime_awaiting_order.id


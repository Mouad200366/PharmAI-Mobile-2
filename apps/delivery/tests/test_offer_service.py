from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.core.constants import UserRole
from apps.delivery.models import (
    DeliveryAgentProfile,
    DeliveryOffer,
    DeliveryOfferStatus,
)
from apps.delivery.services.offers import (
    accept_offer,
    decline_offer,
    get_current_offer,
)
from apps.orders.constants import OrderStatus, PaymentMethod
from apps.orders.models import Order


User = get_user_model()


@pytest.fixture
def delivery_agent(db):
    return User.objects.create_user(
        phone="+212600200001",
        password="StrongPass123!",
        email="delivery.agent@example.com",
        cin="DG123456",
        first_name="Delivery",
        last_name="Agent",
        date_of_birth=date(1994, 1, 1),
        gender="M",
        role=UserRole.DELIVERY,
        is_phone_verified=True,
    )


@pytest.fixture
def delivery_profile(delivery_agent):
    return DeliveryAgentProfile.objects.create(
        user=delivery_agent,
        approved_at=timezone.now(),
        is_online=True,
        current_location=Point(-7.5900, 33.5730, srid=4326),
        location_updated_at=timezone.now(),
    )


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


@pytest.fixture
def pending_offer(awaiting_order, delivery_agent):
    return DeliveryOffer.objects.create(
        order=awaiting_order,
        agent=delivery_agent,
        status=DeliveryOfferStatus.PENDING,
        expires_at=timezone.now() + timedelta(seconds=20),
        earning_amount=Decimal("15.00"),
    )


@pytest.mark.django_db
def test_get_current_offer_returns_valid_pending_offer(
    delivery_profile,
    pending_offer,
):
    offer = get_current_offer(delivery_profile.user)

    assert offer is not None
    assert offer.id == pending_offer.id
    assert offer.status == DeliveryOfferStatus.PENDING


@pytest.mark.django_db
def test_accept_offer_assigns_agent_only_after_acceptance(
    delivery_profile,
    pending_offer,
    awaiting_order,
):
    awaiting_order.refresh_from_db()
    assert awaiting_order.delivery_agent_id is None

    accepted = accept_offer(
        offer_id=pending_offer.id,
        agent=delivery_profile.user,
    )

    awaiting_order.refresh_from_db()
    pending_offer.refresh_from_db()

    assert accepted.id == pending_offer.id
    assert pending_offer.status == DeliveryOfferStatus.ACCEPTED
    assert pending_offer.responded_at is not None
    assert awaiting_order.delivery_agent_id == delivery_profile.user_id


@pytest.mark.django_db
def test_decline_offer_keeps_order_unassigned_and_redispatches(
    monkeypatch,
    delivery_profile,
    pending_offer,
    awaiting_order,
):
    redispatched = []

    monkeypatch.setattr(
        "apps.delivery.services.offers._redispatch",
        lambda order: redispatched.append(order.id),
    )

    declined = decline_offer(
        offer_id=pending_offer.id,
        agent=delivery_profile.user,
    )

    awaiting_order.refresh_from_db()
    pending_offer.refresh_from_db()

    assert declined.id == pending_offer.id
    assert pending_offer.status == DeliveryOfferStatus.DECLINED
    assert pending_offer.responded_at is not None
    assert awaiting_order.delivery_agent_id is None
    assert redispatched == [awaiting_order.id]


@pytest.mark.django_db
def test_expired_current_offer_is_closed_and_redispatched(
    monkeypatch,
    delivery_profile,
    pending_offer,
    awaiting_order,
):
    pending_offer.expires_at = timezone.now() - timedelta(seconds=1)
    pending_offer.save(update_fields=("expires_at", "updated_at"))

    redispatched = []

    monkeypatch.setattr(
        "apps.delivery.services.offers._redispatch",
        lambda order: redispatched.append(order.id),
    )

    result = get_current_offer(delivery_profile.user)

    pending_offer.refresh_from_db()
    awaiting_order.refresh_from_db()

    assert result is None
    assert pending_offer.status == DeliveryOfferStatus.EXPIRED
    assert pending_offer.responded_at is not None
    assert awaiting_order.delivery_agent_id is None
    assert redispatched == [awaiting_order.id]


@pytest.mark.django_db
def test_offline_agent_cannot_accept_offer(
    delivery_profile,
    pending_offer,
    awaiting_order,
):
    delivery_profile.is_online = False
    delivery_profile.save(update_fields=("is_online", "updated_at"))

    with pytest.raises(ValidationError):
        accept_offer(
            offer_id=pending_offer.id,
            agent=delivery_profile.user,
        )

    awaiting_order.refresh_from_db()
    pending_offer.refresh_from_db()

    assert awaiting_order.delivery_agent_id is None
    assert pending_offer.status == DeliveryOfferStatus.PENDING

@pytest.mark.django_db
def test_unapproved_agent_cannot_accept_offer(
    delivery_profile,
    pending_offer,
    awaiting_order,
):
    delivery_profile.approved_at = None
    delivery_profile.save(
        update_fields=(
            "approved_at",
            "updated_at",
        )
    )

    with pytest.raises(ValidationError):
        accept_offer(
            offer_id=pending_offer.id,
            agent=delivery_profile.user,
        )

    awaiting_order.refresh_from_db()
    pending_offer.refresh_from_db()

    assert awaiting_order.delivery_agent_id is None
    assert pending_offer.status == DeliveryOfferStatus.PENDING


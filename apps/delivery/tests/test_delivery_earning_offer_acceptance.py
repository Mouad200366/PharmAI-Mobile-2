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
    DeliveryAgentWorkStatus,
    DeliveryEarning,
    DeliveryEarningStatus,
    DeliveryOffer,
    DeliveryOfferStatus,
)
from apps.delivery.services.offers import accept_offer
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
def earning_offer_agent(db):
    agent = _create_delivery_agent(
        phone="+212600780001",
        email="earning.offer.agent@example.com",
        cin="EA123451",
        first_name="EarningOffer",
    )

    DeliveryAgentProfile.objects.create(
        user=agent,
        is_online=True,
        current_location=Point(
            -7.5898,
            33.5731,
            srid=4326,
        ),
        location_updated_at=timezone.now(),
        work_status=DeliveryAgentWorkStatus.ACTIVE,
        approved_at=timezone.now(),
    )

    return agent


@pytest.fixture
def earning_offer_order(patient, pharmacy):
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


@pytest.fixture
def earning_offer(earning_offer_order, earning_offer_agent):
    return DeliveryOffer.objects.create(
        order=earning_offer_order,
        agent=earning_offer_agent,
        status=DeliveryOfferStatus.PENDING,
        expires_at=timezone.now() + timedelta(seconds=20),
        earning_amount=Decimal("17.50"),
    )


@pytest.mark.django_db
def test_accept_offer_creates_pending_earning_snapshot(
    earning_offer,
    earning_offer_order,
    earning_offer_agent,
):
    accepted = accept_offer(
        offer_id=earning_offer.id,
        agent=earning_offer_agent,
    )

    earning = DeliveryEarning.objects.get(
        order=earning_offer_order,
    )

    earning_offer_order.refresh_from_db()

    assert accepted.status == DeliveryOfferStatus.ACCEPTED
    assert earning_offer_order.delivery_agent_id == earning_offer_agent.id

    assert earning.agent_id == earning_offer_agent.id
    assert earning.amount == Decimal("17.50")
    assert earning.currency == "MAD"
    assert earning.status == DeliveryEarningStatus.PENDING
    assert earning.earned_at is None
    assert earning.paid_at is None


@pytest.mark.django_db
def test_accept_offer_creates_only_one_earning(
    earning_offer,
    earning_offer_order,
    earning_offer_agent,
):
    accept_offer(
        offer_id=earning_offer.id,
        agent=earning_offer_agent,
    )

    with pytest.raises(
        ValidationError,
        match="This delivery offer is no longer available",
    ):
        accept_offer(
            offer_id=earning_offer.id,
            agent=earning_offer_agent,
        )

    assert DeliveryEarning.objects.filter(
        order=earning_offer_order,
    ).count() == 1


@pytest.mark.django_db
def test_earning_amount_is_snapshotted_from_offer(
    earning_offer,
    earning_offer_order,
    earning_offer_agent,
):
    offered_amount = earning_offer.earning_amount

    accept_offer(
        offer_id=earning_offer.id,
        agent=earning_offer_agent,
    )

    earning = DeliveryEarning.objects.get(
        order=earning_offer_order,
    )

    earning_offer.refresh_from_db()
    earning_offer.earning_amount = Decimal("99.99")
    earning_offer.save(
        update_fields=(
            "earning_amount",
            "updated_at",
        )
    )

    earning.refresh_from_db()

    assert earning.amount == offered_amount
    assert earning.amount == Decimal("17.50")

@pytest.mark.django_db
def test_cancelled_earning_is_reused_for_new_agent_acceptance(
    earning_offer,
    earning_offer_order,
    earning_offer_agent,
):
    first_accepted = accept_offer(
        offer_id=earning_offer.id,
        agent=earning_offer_agent,
    )

    earning = DeliveryEarning.objects.get(
        order=earning_offer_order,
    )
    original_earning_id = earning.id

    earning.status = DeliveryEarningStatus.CANCELLED
    earning.save(
        update_fields=(
            "status",
            "updated_at",
        )
    )

    earning_offer.refresh_from_db()
    earning_offer.status = DeliveryOfferStatus.CANCELLED
    earning_offer.save(
        update_fields=(
            "status",
            "updated_at",
        )
    )

    earning_offer_order.delivery_agent = None
    earning_offer_order.save(
        update_fields=(
            "delivery_agent",
            "updated_at",
        )
    )

    second_agent = _create_delivery_agent(
        phone="+212600780002",
        email="earning.offer.second@example.com",
        cin="EA123452",
        first_name="SecondEarning",
    )

    DeliveryAgentProfile.objects.create(
        user=second_agent,
        is_online=True,
        current_location=Point(
            -7.5900,
            33.5730,
            srid=4326,
        ),
        location_updated_at=timezone.now(),
        work_status=DeliveryAgentWorkStatus.ACTIVE,
        approved_at=timezone.now(),
    )

    second_offer = DeliveryOffer.objects.create(
        order=earning_offer_order,
        agent=second_agent,
        status=DeliveryOfferStatus.PENDING,
        expires_at=timezone.now() + timedelta(seconds=20),
        earning_amount=Decimal("19.25"),
    )

    second_accepted = accept_offer(
        offer_id=second_offer.id,
        agent=second_agent,
    )

    earning_offer_order.refresh_from_db()
    earning.refresh_from_db()

    assert first_accepted.status == DeliveryOfferStatus.ACCEPTED
    assert second_accepted.status == DeliveryOfferStatus.ACCEPTED
    assert earning.id == original_earning_id
    assert DeliveryEarning.objects.filter(
        order=earning_offer_order,
    ).count() == 1

    assert earning_offer_order.delivery_agent_id == second_agent.id
    assert earning.agent_id == second_agent.id
    assert earning.amount == Decimal("19.25")
    assert earning.currency == "MAD"
    assert earning.status == DeliveryEarningStatus.PENDING
    assert earning.earned_at is None
    assert earning.paid_at is None


@pytest.mark.django_db
def test_pending_earning_blocks_reassignment(
    earning_offer,
    earning_offer_order,
    earning_offer_agent,
):
    accept_offer(
        offer_id=earning_offer.id,
        agent=earning_offer_agent,
    )

    earning_offer_order.delivery_agent = None
    earning_offer_order.save(
        update_fields=(
            "delivery_agent",
            "updated_at",
        )
    )

    second_agent = _create_delivery_agent(
        phone="+212600780003",
        email="earning.offer.blocked@example.com",
        cin="EA123453",
        first_name="BlockedEarning",
    )

    DeliveryAgentProfile.objects.create(
        user=second_agent,
        is_online=True,
        current_location=Point(
            -7.5900,
            33.5730,
            srid=4326,
        ),
        location_updated_at=timezone.now(),
        work_status=DeliveryAgentWorkStatus.ACTIVE,
        approved_at=timezone.now(),
    )

    second_offer = DeliveryOffer.objects.create(
        order=earning_offer_order,
        agent=second_agent,
        status=DeliveryOfferStatus.PENDING,
        expires_at=timezone.now() + timedelta(seconds=20),
        earning_amount=Decimal("21.00"),
    )

    with pytest.raises(
        ValidationError,
        match="already has an active delivery earning",
    ):
        accept_offer(
            offer_id=second_offer.id,
            agent=second_agent,
        )

    earning_offer_order.refresh_from_db()
    second_offer.refresh_from_db()

    earning = DeliveryEarning.objects.get(
        order=earning_offer_order,
    )

    assert earning_offer_order.delivery_agent_id is None
    assert second_offer.status == DeliveryOfferStatus.PENDING
    assert earning.agent_id == earning_offer_agent.id
    assert earning.status == DeliveryEarningStatus.PENDING


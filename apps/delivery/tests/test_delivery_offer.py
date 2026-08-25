from datetime import date
from decimal import Decimal
from datetime import timedelta

import pytest
from django.contrib.gis.geos import Point
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.core.constants import Gender, UserRole
from apps.delivery.models import DeliveryOffer, DeliveryOfferStatus
from apps.orders.models import Order
from apps.users.models import User


def make_user(*, phone, cin, role, first_name):
    return User.objects.create_user(
        phone=phone,
        password='TestPass123!',
        cin=cin,
        first_name=first_name,
        last_name='Test',
        date_of_birth=date(2000, 1, 1),
        gender=Gender.MALE,
        role=role,
        is_phone_verified=True,
    )


def make_order(*, customer, longitude=-7.5898, latitude=33.5731):
    return Order.objects.create(
        customer=customer,
        delivery_address='Test delivery address',
        delivery_location=Point(longitude, latitude, srid=4326),
    )


def make_offer(*, order, agent, status=DeliveryOfferStatus.PENDING):
    return DeliveryOffer.objects.create(
        order=order,
        agent=agent,
        status=status,
        expires_at=timezone.now() + timedelta(seconds=20),
        earning_amount=Decimal('20.00'),
    )


@pytest.mark.django_db
def test_agent_cannot_have_two_pending_offers():
    customer = make_user(
        phone='+212600001001',
        cin='AB130001',
        role=UserRole.PATIENT,
        first_name='Customer',
    )
    agent = make_user(
        phone='+212600001002',
        cin='AB130002',
        role=UserRole.DELIVERY,
        first_name='Agent',
    )

    first_order = make_order(customer=customer)
    second_order = make_order(
        customer=customer,
        longitude=-7.6000,
        latitude=33.5800,
    )

    make_offer(order=first_order, agent=agent)

    with pytest.raises(IntegrityError):
        with transaction.atomic():
            make_offer(order=second_order, agent=agent)


@pytest.mark.django_db
def test_order_cannot_have_two_pending_offers():
    customer = make_user(
        phone='+212600001011',
        cin='AB130011',
        role=UserRole.PATIENT,
        first_name='Customer',
    )
    first_agent = make_user(
        phone='+212600001012',
        cin='AB130012',
        role=UserRole.DELIVERY,
        first_name='AgentOne',
    )
    second_agent = make_user(
        phone='+212600001013',
        cin='AB130013',
        role=UserRole.DELIVERY,
        first_name='AgentTwo',
    )

    order = make_order(customer=customer)

    make_offer(order=order, agent=first_agent)

    with pytest.raises(IntegrityError):
        with transaction.atomic():
            make_offer(order=order, agent=second_agent)


@pytest.mark.django_db
def test_order_cannot_have_two_accepted_offers():
    customer = make_user(
        phone='+212600001021',
        cin='AB130021',
        role=UserRole.PATIENT,
        first_name='Customer',
    )
    first_agent = make_user(
        phone='+212600001022',
        cin='AB130022',
        role=UserRole.DELIVERY,
        first_name='AgentOne',
    )
    second_agent = make_user(
        phone='+212600001023',
        cin='AB130023',
        role=UserRole.DELIVERY,
        first_name='AgentTwo',
    )

    order = make_order(customer=customer)

    make_offer(
        order=order,
        agent=first_agent,
        status=DeliveryOfferStatus.ACCEPTED,
    )

    with pytest.raises(IntegrityError):
        with transaction.atomic():
            make_offer(
                order=order,
                agent=second_agent,
                status=DeliveryOfferStatus.ACCEPTED,
            )


@pytest.mark.django_db
def test_offer_reports_expired_only_while_pending():
    customer = make_user(
        phone='+212600001031',
        cin='AB130031',
        role=UserRole.PATIENT,
        first_name='Customer',
    )
    agent = make_user(
        phone='+212600001032',
        cin='AB130032',
        role=UserRole.DELIVERY,
        first_name='Agent',
    )
    order = make_order(customer=customer)

    offer = DeliveryOffer.objects.create(
        order=order,
        agent=agent,
        status=DeliveryOfferStatus.PENDING,
        expires_at=timezone.now() - timedelta(seconds=1),
        earning_amount=Decimal('20.00'),
    )

    assert offer.is_expired is True

    offer.status = DeliveryOfferStatus.DECLINED
    assert offer.is_expired is False
from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.contrib.gis.geos import Point
from django.utils import timezone

from apps.core.constants import Gender, UserRole
from apps.delivery.models import (
    DeliveryAgentProfile,
    DeliveryAgentWorkStatus,
    DeliveryOffer,
)
from apps.orders.models import Order
from apps.orders.services.agent_selection import select_agent_for_order
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


def make_order(*, customer):
    return Order.objects.create(
        customer=customer,
        delivery_address='Test delivery address',
        delivery_location=Point(-7.5898, 33.5731, srid=4326),
    )


def make_online_profile(*, user, longitude, latitude, work_status):
    return DeliveryAgentProfile.objects.create(
        user=user,
        work_status=work_status,
        approved_at=timezone.now(),
        is_online=True,
        current_location=Point(longitude, latitude, srid=4326),
        location_updated_at=timezone.now(),
    )


@pytest.mark.django_db
def test_selector_excludes_suspended_agent_even_when_closer():
    customer = make_user(
        phone='+212600002001',
        cin='AB140001',
        role=UserRole.PATIENT,
        first_name='Customer',
    )
    suspended_agent = make_user(
        phone='+212600002002',
        cin='AB140002',
        role=UserRole.DELIVERY,
        first_name='Suspended',
    )
    active_agent = make_user(
        phone='+212600002003',
        cin='AB140003',
        role=UserRole.DELIVERY,
        first_name='Active',
    )

    pharmacy_location = Point(-7.5898, 33.5731, srid=4326)

    make_online_profile(
        user=suspended_agent,
        longitude=-7.5899,
        latitude=33.5732,
        work_status=DeliveryAgentWorkStatus.SUSPENDED,
    )
    make_online_profile(
        user=active_agent,
        longitude=-7.5950,
        latitude=33.5780,
        work_status=DeliveryAgentWorkStatus.ACTIVE,
    )

    selected = select_agent_for_order(pharmacy_location)

    assert selected == active_agent


@pytest.mark.django_db
def test_selector_excludes_agent_with_pending_offer():
    customer = make_user(
        phone='+212600002011',
        cin='AB140011',
        role=UserRole.PATIENT,
        first_name='Customer',
    )
    first_agent = make_user(
        phone='+212600002012',
        cin='AB140012',
        role=UserRole.DELIVERY,
        first_name='First',
    )
    second_agent = make_user(
        phone='+212600002013',
        cin='AB140013',
        role=UserRole.DELIVERY,
        first_name='Second',
    )

    pharmacy_location = Point(-7.5898, 33.5731, srid=4326)

    make_online_profile(
        user=first_agent,
        longitude=-7.5899,
        latitude=33.5732,
        work_status=DeliveryAgentWorkStatus.ACTIVE,
    )
    make_online_profile(
        user=second_agent,
        longitude=-7.5950,
        latitude=33.5780,
        work_status=DeliveryAgentWorkStatus.ACTIVE,
    )

    offered_order = make_order(customer=customer)
    DeliveryOffer.objects.create(
        order=offered_order,
        agent=first_agent,
        expires_at=timezone.now() + timedelta(seconds=20),
        earning_amount=Decimal('20.00'),
    )

    selected = select_agent_for_order(pharmacy_location)

    assert selected == second_agent

@pytest.mark.django_db
def test_selector_excludes_unapproved_agent_even_when_closer():
    unapproved_agent = make_user(
        phone='+212600002021',
        cin='AB140021',
        role=UserRole.DELIVERY,
        first_name='Unapproved',
    )
    approved_agent = make_user(
        phone='+212600002022',
        cin='AB140022',
        role=UserRole.DELIVERY,
        first_name='Approved',
    )

    pharmacy_location = Point(-7.5898, 33.5731, srid=4326)

    DeliveryAgentProfile.objects.create(
        user=unapproved_agent,
        work_status=DeliveryAgentWorkStatus.ACTIVE,
        approved_at=None,
        is_online=True,
        current_location=Point(-7.5899, 33.5732, srid=4326),
        location_updated_at=timezone.now(),
    )

    make_online_profile(
        user=approved_agent,
        longitude=-7.5950,
        latitude=33.5780,
        work_status=DeliveryAgentWorkStatus.ACTIVE,
    )

    selected = select_agent_for_order(pharmacy_location)

    assert selected == approved_agent


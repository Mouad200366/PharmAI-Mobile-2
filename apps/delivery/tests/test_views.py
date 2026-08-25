from django.utils import timezone
from django.contrib.gis.geos import Point
from datetime import date

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from apps.core.constants import Gender, UserRole
from apps.delivery.models import (
    DeliveryAgentProfile,
    DeliveryAgentWorkStatus,
)
from apps.orders.constants import OrderStatus
from apps.orders.models import Order
from apps.users.models import User


@pytest.mark.django_db
def test_suspended_delivery_agent_cannot_go_online():
    user = User.objects.create_user(
        phone='+212600000901',
        password='TestPass123!',
        cin='AB123456',
        first_name='Delivery',
        last_name='Agent',
        date_of_birth=date(2000, 1, 1),
        gender=Gender.MALE,
        role=UserRole.DELIVERY,
        is_phone_verified=True,
    )

    profile = DeliveryAgentProfile.objects.create(
        user=user,
        work_status=DeliveryAgentWorkStatus.SUSPENDED,
        approved_at=timezone.now(),
        suspension_reason='Test suspension',
    )

    client = APIClient()
    client.force_authenticate(user=user)

    response = client.post(
        '/api/v1/delivery/online/',
        {
            'is_online': True,
            'latitude': 33.5731,
            'longitude': -7.5898,
        },
        format='json',
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN

    profile.refresh_from_db()
    assert profile.is_online is False


@pytest.mark.django_db
def test_active_delivery_agent_can_go_online():
    user = User.objects.create_user(
        phone='+212600000902',
        password='TestPass123!',
        cin='AB123457',
        first_name='Active',
        last_name='Agent',
        date_of_birth=date(2000, 1, 1),
        gender=Gender.MALE,
        role=UserRole.DELIVERY,
        is_phone_verified=True,
    )

    profile = DeliveryAgentProfile.objects.create(
        user=user,
        work_status=DeliveryAgentWorkStatus.ACTIVE,
        approved_at=timezone.now(),
    )

    client = APIClient()
    client.force_authenticate(user=user)

    response = client.post(
        '/api/v1/delivery/online/',
        {
            'is_online': True,
            'latitude': 33.5731,
            'longitude': -7.5898,
        },
        format='json',
    )

    assert response.status_code == status.HTTP_200_OK

    profile.refresh_from_db()
    assert profile.is_online is True
    assert profile.current_location is not None
    assert profile.location_updated_at is not None

@pytest.mark.django_db
def test_unapproved_active_delivery_agent_cannot_go_online():
    user = User.objects.create_user(
        phone="+212600920001",
        password="StrongPass123!",
        email="unapproved.online.agent@example.com",
        cin="UA123451",
        first_name="Unapproved",
        last_name="Courier",
        date_of_birth=date(2000, 1, 1),
        gender=Gender.MALE,
        role=UserRole.DELIVERY,
        is_phone_verified=True,
    )

    profile = DeliveryAgentProfile.objects.create(
        user=user,
        work_status=DeliveryAgentWorkStatus.ACTIVE,
        approved_at=None,
    )

    client = APIClient()
    client.force_authenticate(user=user)

    response = client.post(
        "/api/v1/delivery/online/",
        {
            "is_online": True,
            "latitude": 33.5731,
            "longitude": -7.5898,
        },
        format="json",
    )

    assert response.status_code == 403

    profile.refresh_from_db()
    assert profile.is_online is False

@pytest.mark.django_db
def test_idle_approved_delivery_agent_can_go_offline():
    user = User.objects.create_user(
        phone="+212600930001",
        password="StrongPass123!",
        email="idle.offline.agent@example.com",
        cin="GO123451",
        first_name="Idle",
        last_name="Courier",
        date_of_birth=date(2000, 1, 1),
        gender=Gender.MALE,
        role=UserRole.DELIVERY,
        is_phone_verified=True,
    )

    profile = DeliveryAgentProfile.objects.create(
        user=user,
        work_status=DeliveryAgentWorkStatus.ACTIVE,
        approved_at=timezone.now(),
        is_online=True,
    )

    client = APIClient()
    client.force_authenticate(user=user)

    response = client.post(
        "/api/v1/delivery/online/",
        {
            "is_online": False,
        },
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK

    profile.refresh_from_db()
    assert profile.is_online is False


@pytest.mark.django_db
def test_delivery_agent_with_active_order_cannot_go_offline():
    user = User.objects.create_user(
        phone="+212600930002",
        password="StrongPass123!",
        email="active.offline.agent@example.com",
        cin="GO123452",
        first_name="Active",
        last_name="Courier",
        date_of_birth=date(2000, 1, 1),
        gender=Gender.MALE,
        role=UserRole.DELIVERY,
        is_phone_verified=True,
    )

    patient = User.objects.create_user(
        phone="+212600930003",
        password="StrongPass123!",
        email="active.offline.patient@example.com",
        cin="GO123453",
        first_name="Patient",
        last_name="Test",
        date_of_birth=date(2000, 1, 1),
        gender=Gender.MALE,
        role=UserRole.PATIENT,
        is_phone_verified=True,
    )

    profile = DeliveryAgentProfile.objects.create(
        user=user,
        work_status=DeliveryAgentWorkStatus.ACTIVE,
        approved_at=timezone.now(),
        is_online=True,
    )

    order = Order.objects.create(
        customer=patient,
        delivery_agent=user,
        status=OrderStatus.AWAITING_AGENT,
        delivery_address="Test delivery address",
        delivery_location=Point(-7.5898, 33.5731, srid=4326),
    )

    client = APIClient()
    client.force_authenticate(user=user)

    response = client.post(
        "/api/v1/delivery/online/",
        {
            "is_online": False,
        },
        format="json",
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN

    profile.refresh_from_db()
    order.refresh_from_db()

    assert profile.is_online is True
    assert order.delivery_agent_id == user.id
    assert order.status == OrderStatus.AWAITING_AGENT


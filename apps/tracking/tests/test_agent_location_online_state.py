from datetime import date

import pytest
from asgiref.sync import async_to_sync
from django.contrib.auth import get_user_model

from apps.core.constants import UserRole
from apps.delivery.models import DeliveryAgentProfile
from apps.tracking.consumers import AgentLocationConsumer


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


@pytest.mark.django_db(transaction=True)
def test_gps_update_does_not_force_offline_agent_online():
    agent = _create_delivery_agent(
        phone="+212600910001",
        email="gps.offline.agent@example.com",
        cin="GP123451",
        first_name="OfflineGPS",
    )

    profile, _ = DeliveryAgentProfile.objects.get_or_create(
        user=agent,
    )
    profile.is_online = False
    profile.current_location = None
    profile.location_updated_at = None
    profile.save(
        update_fields=(
            "is_online",
            "current_location",
            "location_updated_at",
            "updated_at",
        ),
    )

    consumer = AgentLocationConsumer()

    async_to_sync(
        consumer._update_location_and_lookup_active
    )(
        agent.id,
        33.5731,
        -7.5898,
    )

    profile.refresh_from_db()

    assert profile.is_online is False
    assert profile.current_location is not None
    assert profile.current_location.x == pytest.approx(-7.5898)
    assert profile.current_location.y == pytest.approx(33.5731)
    assert profile.location_updated_at is not None


@pytest.mark.django_db(transaction=True)
def test_gps_update_preserves_online_agent_online():
    agent = _create_delivery_agent(
        phone="+212600910002",
        email="gps.online.agent@example.com",
        cin="GP123452",
        first_name="OnlineGPS",
    )

    profile, _ = DeliveryAgentProfile.objects.get_or_create(
        user=agent,
    )
    profile.is_online = True
    profile.current_location = None
    profile.location_updated_at = None
    profile.save(
        update_fields=(
            "is_online",
            "current_location",
            "location_updated_at",
            "updated_at",
        ),
    )

    consumer = AgentLocationConsumer()

    async_to_sync(
        consumer._update_location_and_lookup_active
    )(
        agent.id,
        33.5731,
        -7.5898,
    )

    profile.refresh_from_db()

    assert profile.is_online is True
    assert profile.current_location is not None
    assert profile.current_location.x == pytest.approx(-7.5898)
    assert profile.current_location.y == pytest.approx(33.5731)
    assert profile.location_updated_at is not None
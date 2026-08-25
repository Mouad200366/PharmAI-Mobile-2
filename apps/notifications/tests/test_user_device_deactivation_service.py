from datetime import date

import pytest
from django.contrib.auth import get_user_model
from rest_framework.exceptions import ValidationError

from apps.core.constants import UserRole
from apps.notifications.models import (
    DevicePlatform,
    UserDevice,
)
from apps.notifications.services import (
    deactivate_user_device,
    register_user_device,
)


User = get_user_model()


def _create_user(*, phone, email, cin, first_name):
    return User.objects.create_user(
        phone=phone,
        password="StrongPass123!",
        email=email,
        cin=cin,
        first_name=first_name,
        last_name="DeviceDeactivate",
        date_of_birth=date(1993, 1, 1),
        gender="M",
        role=UserRole.DELIVERY,
        is_phone_verified=True,
    )


@pytest.fixture
def deactivate_user(db):
    return _create_user(
        phone="+212600888001",
        email="device.deactivate.user@example.com",
        cin="UD980001",
        first_name="DeactivateUser",
    )


@pytest.mark.django_db
def test_deactivate_user_device_clears_push_and_primary_state(
    deactivate_user,
):
    device = register_user_device(
        user=deactivate_user,
        device_id="deactivate-install-one",
        platform=DevicePlatform.ANDROID,
        push_token="ExponentPushToken[deactivate-one]",
        app_version="1.0.0",
        is_primary=True,
    )

    old_last_seen_at = device.last_seen_at

    deactivated = deactivate_user_device(
        user=deactivate_user,
        device_id=" deactivate-install-one ",
    )

    deactivated.refresh_from_db()

    assert deactivated.id == device.id
    assert deactivated.push_token is None
    assert deactivated.is_active is False
    assert deactivated.is_primary is False
    assert deactivated.last_seen_at is not None
    assert deactivated.last_seen_at >= old_last_seen_at


@pytest.mark.django_db
def test_user_cannot_deactivate_another_users_device(
    deactivate_user,
):
    other_user = _create_user(
        phone="+212600888002",
        email="device.deactivate.other@example.com",
        cin="UD980002",
        first_name="OtherDeactivateUser",
    )

    device = register_user_device(
        user=other_user,
        device_id="other-users-installation",
        platform=DevicePlatform.IOS,
        push_token="ExponentPushToken[other-user]",
        is_primary=True,
    )

    with pytest.raises(
        ValidationError,
        match="Device registration not found for this user",
    ):
        deactivate_user_device(
            user=deactivate_user,
            device_id="other-users-installation",
        )

    device.refresh_from_db()

    assert device.user_id == other_user.id
    assert device.push_token == "ExponentPushToken[other-user]"
    assert device.is_active is True
    assert device.is_primary is True


@pytest.mark.django_db
@pytest.mark.parametrize(
    "device_id",
    (
        "",
        "   ",
        "missing-device",
    ),
)
def test_deactivate_user_device_rejects_invalid_or_missing_device(
    deactivate_user,
    device_id,
):
    expected_message = (
        "device_id is required"
        if not device_id.strip()
        else "Device registration not found for this user"
    )

    with pytest.raises(
        ValidationError,
        match=expected_message,
    ):
        deactivate_user_device(
            user=deactivate_user,
            device_id=device_id,
        )


@pytest.mark.django_db
def test_deactivated_installation_can_be_registered_again(
    deactivate_user,
):
    original = register_user_device(
        user=deactivate_user,
        device_id="reactivate-installation",
        platform=DevicePlatform.ANDROID,
        push_token="ExponentPushToken[old-reactivate]",
        is_primary=True,
    )

    deactivate_user_device(
        user=deactivate_user,
        device_id="reactivate-installation",
    )

    reactivated = register_user_device(
        user=deactivate_user,
        device_id="reactivate-installation",
        platform=DevicePlatform.IOS,
        push_token="ExponentPushToken[new-reactivate]",
        app_version="2.0.0",
        is_primary=True,
    )

    assert reactivated.id == original.id

    reactivated.refresh_from_db()

    assert reactivated.platform == DevicePlatform.IOS
    assert reactivated.push_token == "ExponentPushToken[new-reactivate]"
    assert reactivated.app_version == "2.0.0"
    assert reactivated.is_active is True
    assert reactivated.is_primary is True

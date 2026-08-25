from datetime import date

import pytest
from django.contrib.auth import get_user_model
from django.db import IntegrityError

from apps.core.constants import UserRole
from apps.notifications.models import (
    DevicePlatform,
    UserDevice,
)


User = get_user_model()


def _create_user(*, phone, email, cin, first_name):
    return User.objects.create_user(
        phone=phone,
        password="StrongPass123!",
        email=email,
        cin=cin,
        first_name=first_name,
        last_name="DeviceTest",
        date_of_birth=date(1993, 1, 1),
        gender="M",
        role=UserRole.DELIVERY,
        is_phone_verified=True,
    )


@pytest.fixture
def device_user(db):
    return _create_user(
        phone="+212600885001",
        email="device.model.user@example.com",
        cin="UD950001",
        first_name="DeviceUser",
    )


@pytest.mark.django_db
def test_user_device_defaults(device_user):
    device = UserDevice.objects.create(
        user=device_user,
        device_id="install-device-defaults",
        platform=DevicePlatform.ANDROID,
    )

    assert device.is_active is True
    assert device.is_primary is False
    assert device.push_token is None
    assert device.app_version == ""
    assert device.last_seen_at is None


@pytest.mark.django_db(transaction=True)
def test_device_id_must_be_globally_unique(device_user):
    other_user = _create_user(
        phone="+212600885002",
        email="device.model.other@example.com",
        cin="UD950002",
        first_name="OtherDeviceUser",
    )

    UserDevice.objects.create(
        user=device_user,
        device_id="same-installation-id",
        platform=DevicePlatform.ANDROID,
    )

    with pytest.raises(IntegrityError):
        UserDevice.objects.create(
            user=other_user,
            device_id="same-installation-id",
            platform=DevicePlatform.IOS,
        )


@pytest.mark.django_db(transaction=True)
def test_non_null_push_token_must_be_globally_unique(device_user):
    other_user = _create_user(
        phone="+212600885003",
        email="device.model.push.other@example.com",
        cin="UD950003",
        first_name="PushOther",
    )

    UserDevice.objects.create(
        user=device_user,
        device_id="push-device-one",
        platform=DevicePlatform.ANDROID,
        push_token="ExponentPushToken[shared-token]",
    )

    with pytest.raises(IntegrityError):
        UserDevice.objects.create(
            user=other_user,
            device_id="push-device-two",
            platform=DevicePlatform.IOS,
            push_token="ExponentPushToken[shared-token]",
        )


@pytest.mark.django_db
def test_user_can_have_multiple_non_primary_devices(device_user):
    first = UserDevice.objects.create(
        user=device_user,
        device_id="non-primary-one",
        platform=DevicePlatform.ANDROID,
    )
    second = UserDevice.objects.create(
        user=device_user,
        device_id="non-primary-two",
        platform=DevicePlatform.IOS,
    )

    assert UserDevice.objects.filter(user=device_user).count() == 2
    assert first.is_primary is False
    assert second.is_primary is False


@pytest.mark.django_db(transaction=True)
def test_user_can_have_only_one_active_primary_device(device_user):
    UserDevice.objects.create(
        user=device_user,
        device_id="primary-one",
        platform=DevicePlatform.ANDROID,
        is_active=True,
        is_primary=True,
    )

    with pytest.raises(IntegrityError):
        UserDevice.objects.create(
            user=device_user,
            device_id="primary-two",
            platform=DevicePlatform.IOS,
            is_active=True,
            is_primary=True,
        )


@pytest.mark.django_db
def test_inactive_primary_device_does_not_block_active_primary(device_user):
    UserDevice.objects.create(
        user=device_user,
        device_id="inactive-primary",
        platform=DevicePlatform.ANDROID,
        is_active=False,
        is_primary=True,
    )
    active_primary = UserDevice.objects.create(
        user=device_user,
        device_id="active-primary",
        platform=DevicePlatform.IOS,
        is_active=True,
        is_primary=True,
    )

    assert active_primary.is_active is True
    assert active_primary.is_primary is True

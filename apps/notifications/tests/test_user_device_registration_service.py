from datetime import date

import pytest
from django.contrib.auth import get_user_model
from rest_framework.exceptions import ValidationError

from apps.core.constants import UserRole
from apps.notifications.models import (
    DevicePlatform,
    UserDevice,
)
from apps.notifications.services import register_user_device


User = get_user_model()


def _create_user(*, phone, email, cin, first_name):
    return User.objects.create_user(
        phone=phone,
        password="StrongPass123!",
        email=email,
        cin=cin,
        first_name=first_name,
        last_name="DeviceService",
        date_of_birth=date(1993, 1, 1),
        gender="M",
        role=UserRole.DELIVERY,
        is_phone_verified=True,
    )


@pytest.fixture
def registration_user(db):
    return _create_user(
        phone="+212600886001",
        email="device.registration.user@example.com",
        cin="UR960001",
        first_name="RegistrationUser",
    )


@pytest.mark.django_db
def test_register_user_device_creates_active_primary_device(
    registration_user,
):
    device = register_user_device(
        user=registration_user,
        device_id="install-register-one",
        platform=DevicePlatform.ANDROID,
        push_token="ExponentPushToken[register-one]",
        app_version="1.2.3",
        is_primary=True,
    )

    device.refresh_from_db()

    assert device.user_id == registration_user.id
    assert device.device_id == "install-register-one"
    assert device.platform == DevicePlatform.ANDROID
    assert device.push_token == "ExponentPushToken[register-one]"
    assert device.app_version == "1.2.3"
    assert device.is_active is True
    assert device.is_primary is True
    assert device.last_seen_at is not None


@pytest.mark.django_db
def test_register_existing_device_refreshes_and_reactivates(
    registration_user,
):
    device = UserDevice.objects.create(
        user=registration_user,
        device_id="install-refresh",
        platform=DevicePlatform.ANDROID,
        push_token="ExponentPushToken[old-token]",
        app_version="1.0.0",
        is_active=False,
        is_primary=False,
    )

    refreshed = register_user_device(
        user=registration_user,
        device_id=" install-refresh ",
        platform=DevicePlatform.IOS,
        push_token=" ExponentPushToken[new-token] ",
        app_version=" 2.0.0 ",
        is_primary=True,
    )

    assert refreshed.id == device.id

    refreshed.refresh_from_db()

    assert refreshed.platform == DevicePlatform.IOS
    assert refreshed.push_token == "ExponentPushToken[new-token]"
    assert refreshed.app_version == "2.0.0"
    assert refreshed.is_active is True
    assert refreshed.is_primary is True
    assert refreshed.last_seen_at is not None


@pytest.mark.django_db
def test_same_installation_can_transfer_to_another_authenticated_user(
    registration_user,
):
    other_user = _create_user(
        phone="+212600886002",
        email="device.registration.transfer@example.com",
        cin="UR960002",
        first_name="TransferUser",
    )

    original = register_user_device(
        user=registration_user,
        device_id="install-transfer",
        platform=DevicePlatform.ANDROID,
        push_token="ExponentPushToken[transfer]",
        is_primary=True,
    )

    transferred = register_user_device(
        user=other_user,
        device_id="install-transfer",
        platform=DevicePlatform.ANDROID,
        push_token="ExponentPushToken[transfer]",
        is_primary=True,
    )

    assert transferred.id == original.id

    transferred.refresh_from_db()

    assert transferred.user_id == other_user.id
    assert transferred.is_active is True
    assert transferred.is_primary is True

    assert not UserDevice.objects.filter(
        user=registration_user,
        device_id="install-transfer",
    ).exists()


@pytest.mark.django_db
def test_push_token_is_transferred_from_stale_device(
    registration_user,
):
    other_user = _create_user(
        phone="+212600886003",
        email="device.registration.token@example.com",
        cin="UR960003",
        first_name="TokenOwner",
    )

    stale = UserDevice.objects.create(
        user=other_user,
        device_id="stale-installation",
        platform=DevicePlatform.ANDROID,
        push_token="ExponentPushToken[rotating-token]",
    )

    current = register_user_device(
        user=registration_user,
        device_id="current-installation",
        platform=DevicePlatform.IOS,
        push_token="ExponentPushToken[rotating-token]",
        is_primary=True,
    )

    stale.refresh_from_db()
    current.refresh_from_db()

    assert stale.push_token is None
    assert current.push_token == "ExponentPushToken[rotating-token]"


@pytest.mark.django_db
def test_registering_new_primary_demotes_previous_active_primary(
    registration_user,
):
    previous = register_user_device(
        user=registration_user,
        device_id="primary-old",
        platform=DevicePlatform.ANDROID,
        is_primary=True,
    )

    current = register_user_device(
        user=registration_user,
        device_id="primary-new",
        platform=DevicePlatform.IOS,
        is_primary=True,
    )

    previous.refresh_from_db()
    current.refresh_from_db()

    assert previous.is_active is True
    assert previous.is_primary is False
    assert current.is_active is True
    assert current.is_primary is True


@pytest.mark.django_db
def test_registering_non_primary_device_keeps_existing_primary(
    registration_user,
):
    primary = register_user_device(
        user=registration_user,
        device_id="primary-stays",
        platform=DevicePlatform.ANDROID,
        is_primary=True,
    )

    secondary = register_user_device(
        user=registration_user,
        device_id="secondary-device",
        platform=DevicePlatform.IOS,
        is_primary=False,
    )

    primary.refresh_from_db()
    secondary.refresh_from_db()

    assert primary.is_primary is True
    assert primary.is_active is True
    assert secondary.is_primary is False
    assert secondary.is_active is True


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("device_id", "platform", "message"),
    (
        ("", DevicePlatform.ANDROID, "device_id is required"),
        ("   ", DevicePlatform.IOS, "device_id is required"),
        ("valid-device", "windows", "Unsupported device platform"),
    ),
)
def test_register_user_device_validates_required_inputs(
    registration_user,
    device_id,
    platform,
    message,
):
    with pytest.raises(
        ValidationError,
        match=message,
    ):
        register_user_device(
            user=registration_user,
            device_id=device_id,
            platform=platform,
        )

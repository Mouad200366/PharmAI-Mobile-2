from datetime import date

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse

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
        last_name="DeviceAPI",
        date_of_birth=date(1993, 1, 1),
        gender="M",
        role=UserRole.DELIVERY,
        is_phone_verified=True,
    )


@pytest.fixture
def device_api_user(db):
    return _create_user(
        phone="+212600887001",
        email="device.api.user@example.com",
        cin="UA970001",
        first_name="DeviceAPIUser",
    )


@pytest.mark.django_db
def test_unauthenticated_user_cannot_register_device(api_client):
    response = api_client.post(
        reverse("v1:user-device-register"),
        {
            "device_id": "anonymous-installation",
            "platform": DevicePlatform.ANDROID,
        },
        format="json",
    )

    assert response.status_code == 401
    assert not UserDevice.objects.exists()


@pytest.mark.django_db
def test_authenticated_user_can_register_device(
    api_client,
    device_api_user,
):
    api_client.force_authenticate(user=device_api_user)

    response = api_client.post(
        reverse("v1:user-device-register"),
        {
            "device_id": "api-install-one",
            "platform": DevicePlatform.ANDROID,
            "push_token": "ExponentPushToken[api-one]",
            "app_version": "1.0.0",
        },
        format="json",
    )

    assert response.status_code == 200

    device = UserDevice.objects.get(
        device_id="api-install-one",
    )

    assert response.data["id"] == device.id
    assert response.data["user_id"] == device_api_user.id
    assert response.data["platform"] == DevicePlatform.ANDROID
    assert response.data["push_token"] == "ExponentPushToken[api-one]"
    assert response.data["app_version"] == "1.0.0"
    assert response.data["is_active"] is True
    assert response.data["is_primary"] is True
    assert response.data["last_seen_at"] is not None


@pytest.mark.django_db
def test_register_endpoint_refreshes_existing_installation(
    api_client,
    device_api_user,
):
    api_client.force_authenticate(user=device_api_user)

    first = api_client.post(
        reverse("v1:user-device-register"),
        {
            "device_id": "api-refresh-install",
            "platform": DevicePlatform.ANDROID,
            "push_token": "ExponentPushToken[api-old]",
            "app_version": "1.0.0",
            "is_primary": False,
        },
        format="json",
    )
    second = api_client.post(
        reverse("v1:user-device-register"),
        {
            "device_id": "api-refresh-install",
            "platform": DevicePlatform.IOS,
            "push_token": "ExponentPushToken[api-new]",
            "app_version": "2.0.0",
            "is_primary": True,
        },
        format="json",
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.data["id"] == second.data["id"]

    device = UserDevice.objects.get(
        device_id="api-refresh-install",
    )

    assert device.platform == DevicePlatform.IOS
    assert device.push_token == "ExponentPushToken[api-new]"
    assert device.app_version == "2.0.0"
    assert device.is_active is True
    assert device.is_primary is True


@pytest.mark.django_db
def test_registering_new_primary_demotes_previous_primary_via_api(
    api_client,
    device_api_user,
):
    api_client.force_authenticate(user=device_api_user)

    first_response = api_client.post(
        reverse("v1:user-device-register"),
        {
            "device_id": "api-primary-one",
            "platform": DevicePlatform.ANDROID,
        },
        format="json",
    )
    second_response = api_client.post(
        reverse("v1:user-device-register"),
        {
            "device_id": "api-primary-two",
            "platform": DevicePlatform.IOS,
        },
        format="json",
    )

    assert first_response.status_code == 200
    assert second_response.status_code == 200

    first = UserDevice.objects.get(
        device_id="api-primary-one",
    )
    second = UserDevice.objects.get(
        device_id="api-primary-two",
    )

    assert first.is_active is True
    assert first.is_primary is False
    assert second.is_active is True
    assert second.is_primary is True


@pytest.mark.django_db
def test_same_installation_can_transfer_between_accounts_via_api(
    api_client,
    device_api_user,
):
    other_user = _create_user(
        phone="+212600887002",
        email="device.api.transfer@example.com",
        cin="UA970002",
        first_name="TransferAPIUser",
    )

    api_client.force_authenticate(user=device_api_user)

    first_response = api_client.post(
        reverse("v1:user-device-register"),
        {
            "device_id": "api-transfer-install",
            "platform": DevicePlatform.ANDROID,
            "push_token": "ExponentPushToken[api-transfer]",
        },
        format="json",
    )

    api_client.force_authenticate(user=other_user)

    second_response = api_client.post(
        reverse("v1:user-device-register"),
        {
            "device_id": "api-transfer-install",
            "platform": DevicePlatform.ANDROID,
            "push_token": "ExponentPushToken[api-transfer]",
        },
        format="json",
    )

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    assert first_response.data["id"] == second_response.data["id"]

    device = UserDevice.objects.get(
        device_id="api-transfer-install",
    )

    assert device.user_id == other_user.id
    assert device.is_active is True
    assert device.is_primary is True


@pytest.mark.django_db
def test_push_token_moves_from_stale_device_via_api(
    api_client,
    device_api_user,
):
    stale_user = _create_user(
        phone="+212600887003",
        email="device.api.stale@example.com",
        cin="UA970003",
        first_name="StaleTokenUser",
    )

    stale = UserDevice.objects.create(
        user=stale_user,
        device_id="api-stale-install",
        platform=DevicePlatform.ANDROID,
        push_token="ExponentPushToken[api-shared]",
    )

    api_client.force_authenticate(user=device_api_user)

    response = api_client.post(
        reverse("v1:user-device-register"),
        {
            "device_id": "api-current-install",
            "platform": DevicePlatform.IOS,
            "push_token": "ExponentPushToken[api-shared]",
        },
        format="json",
    )

    assert response.status_code == 200

    stale.refresh_from_db()
    current = UserDevice.objects.get(
        device_id="api-current-install",
    )

    assert stale.push_token is None
    assert current.push_token == "ExponentPushToken[api-shared]"


@pytest.mark.django_db
@pytest.mark.parametrize(
    "payload",
    (
        {
            "device_id": "",
            "platform": DevicePlatform.ANDROID,
        },
        {
            "device_id": "api-invalid-platform",
            "platform": "windows",
        },
    ),
)
def test_register_device_rejects_invalid_payload(
    api_client,
    device_api_user,
    payload,
):
    api_client.force_authenticate(user=device_api_user)

    response = api_client.post(
        reverse("v1:user-device-register"),
        payload,
        format="json",
    )

    assert response.status_code == 400

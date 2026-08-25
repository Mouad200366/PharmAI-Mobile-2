from datetime import date

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse

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
        last_name="DeviceDeactivateAPI",
        date_of_birth=date(1993, 1, 1),
        gender="M",
        role=UserRole.DELIVERY,
        is_phone_verified=True,
    )


@pytest.fixture
def deactivate_api_user(db):
    return _create_user(
        phone="+212600889001",
        email="device.deactivate.api.user@example.com",
        cin="UDA990001",
        first_name="DeactivateAPIUser",
    )


@pytest.mark.django_db
def test_authenticated_user_can_deactivate_own_device(
    api_client,
    deactivate_api_user,
):
    device = register_user_device(
        user=deactivate_api_user,
        device_id="deactivate-api-own",
        platform=DevicePlatform.ANDROID,
        push_token="ExponentPushToken[deactivate-api-own]",
        is_primary=True,
    )

    api_client.force_authenticate(user=deactivate_api_user)

    response = api_client.post(
        reverse("v1:user-device-deactivate"),
        {
            "device_id": "deactivate-api-own",
        },
        format="json",
    )

    assert response.status_code == 200

    device.refresh_from_db()

    assert response.data["id"] == device.id
    assert response.data["push_token"] is None
    assert response.data["is_active"] is False
    assert response.data["is_primary"] is False

    assert device.push_token is None
    assert device.is_active is False
    assert device.is_primary is False
    assert device.last_seen_at is not None


@pytest.mark.django_db
def test_unauthenticated_user_cannot_deactivate_device(
    api_client,
    deactivate_api_user,
):
    device = register_user_device(
        user=deactivate_api_user,
        device_id="deactivate-api-anonymous",
        platform=DevicePlatform.ANDROID,
        push_token="ExponentPushToken[deactivate-api-anonymous]",
        is_primary=True,
    )

    response = api_client.post(
        reverse("v1:user-device-deactivate"),
        {
            "device_id": "deactivate-api-anonymous",
        },
        format="json",
    )

    assert response.status_code == 401

    device.refresh_from_db()

    assert device.push_token == "ExponentPushToken[deactivate-api-anonymous]"
    assert device.is_active is True
    assert device.is_primary is True


@pytest.mark.django_db
def test_user_cannot_deactivate_another_users_device_via_api(
    api_client,
    deactivate_api_user,
):
    other_user = _create_user(
        phone="+212600889002",
        email="device.deactivate.api.other@example.com",
        cin="UDA990002",
        first_name="OtherDeactivateAPI",
    )

    device = register_user_device(
        user=other_user,
        device_id="deactivate-api-other-user",
        platform=DevicePlatform.IOS,
        push_token="ExponentPushToken[deactivate-api-other-user]",
        is_primary=True,
    )

    api_client.force_authenticate(user=deactivate_api_user)

    response = api_client.post(
        reverse("v1:user-device-deactivate"),
        {
            "device_id": "deactivate-api-other-user",
        },
        format="json",
    )

    assert response.status_code == 400

    device.refresh_from_db()

    assert device.user_id == other_user.id
    assert device.push_token == "ExponentPushToken[deactivate-api-other-user]"
    assert device.is_active is True
    assert device.is_primary is True


@pytest.mark.django_db
@pytest.mark.parametrize(
    "payload",
    (
        {},
        {"device_id": ""},
        {"device_id": "missing-device-id"},
    ),
)
def test_deactivate_device_rejects_invalid_or_missing_device(
    api_client,
    deactivate_api_user,
    payload,
):
    api_client.force_authenticate(user=deactivate_api_user)

    response = api_client.post(
        reverse("v1:user-device-deactivate"),
        payload,
        format="json",
    )

    assert response.status_code == 400


@pytest.mark.django_db
def test_deactivated_device_can_be_registered_again_via_api(
    api_client,
    deactivate_api_user,
):
    api_client.force_authenticate(user=deactivate_api_user)

    register_response = api_client.post(
        reverse("v1:user-device-register"),
        {
            "device_id": "deactivate-api-reactivate",
            "platform": DevicePlatform.ANDROID,
            "push_token": "ExponentPushToken[deactivate-api-old]",
        },
        format="json",
    )

    assert register_response.status_code == 200

    device_id = register_response.data["id"]

    deactivate_response = api_client.post(
        reverse("v1:user-device-deactivate"),
        {
            "device_id": "deactivate-api-reactivate",
        },
        format="json",
    )

    assert deactivate_response.status_code == 200

    reactivate_response = api_client.post(
        reverse("v1:user-device-register"),
        {
            "device_id": "deactivate-api-reactivate",
            "platform": DevicePlatform.IOS,
            "push_token": "ExponentPushToken[deactivate-api-new]",
            "app_version": "2.0.0",
        },
        format="json",
    )

    assert reactivate_response.status_code == 200
    assert reactivate_response.data["id"] == device_id
    assert reactivate_response.data["platform"] == DevicePlatform.IOS
    assert (
        reactivate_response.data["push_token"]
        == "ExponentPushToken[deactivate-api-new]"
    )
    assert reactivate_response.data["app_version"] == "2.0.0"
    assert reactivate_response.data["is_active"] is True
    assert reactivate_response.data["is_primary"] is True

    device = UserDevice.objects.get(
        device_id="deactivate-api-reactivate",
    )

    assert device.id == device_id
    assert device.is_active is True
    assert device.is_primary is True

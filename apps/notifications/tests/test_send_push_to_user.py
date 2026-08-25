import pytest
from unittest.mock import patch

from apps.notifications.models import DevicePlatform, UserDevice
from apps.notifications.services import (
    register_user_device,
    send_push_to_user,
)

pytestmark = pytest.mark.django_db


@patch("apps.notifications.services.send_expo_push_notification")
def test_send_push_to_user_uses_active_primary_device(mock_send, patient):
    device = register_user_device(
        user=patient,
        device_id="push-user-primary",
        platform=DevicePlatform.ANDROID,
        push_token="ExponentPushToken[user-primary]",
        is_primary=True,
    )

    mock_send.return_value = {
        "ok": True,
        "ticket_id": "ticket-primary",
        "error": None,
        "error_code": None,
    }

    result = send_push_to_user(
        user=patient,
        title="New offer",
        body="Open the app.",
        data={"offer_id": 77},
        priority="high",
    )

    assert result["ok"] is True
    assert result["ticket_id"] == "ticket-primary"

    mock_send.assert_called_once_with(
        push_token=device.push_token,
        title="New offer",
        body="Open the app.",
        data={"offer_id": 77},
        sound="default",
        priority="high",
    )


@patch("apps.notifications.services.send_expo_push_notification")
def test_send_push_to_user_returns_safe_result_when_no_device(mock_send, patient):
    result = send_push_to_user(
        user=patient,
        title="Ignored",
    )

    assert result == {
        "ok": False,
        "ticket_id": None,
        "error": "No active primary push device is registered.",
        "error_code": "no_active_primary_device",
    }

    mock_send.assert_not_called()


@patch("apps.notifications.services.send_expo_push_notification")
def test_send_push_to_user_ignores_inactive_primary_device(mock_send, patient):
    UserDevice.objects.create(
        user=patient,
        device_id="push-user-inactive",
        platform=DevicePlatform.ANDROID,
        push_token="ExponentPushToken[user-inactive]",
        is_active=False,
        is_primary=True,
    )

    result = send_push_to_user(
        user=patient,
        title="Ignored",
    )

    assert result["ok"] is False
    assert result["error_code"] == "no_active_primary_device"
    mock_send.assert_not_called()


@patch("apps.notifications.services.send_expo_push_notification")
def test_send_push_to_user_ignores_non_primary_device(mock_send, patient):
    UserDevice.objects.create(
        user=patient,
        device_id="push-user-secondary",
        platform=DevicePlatform.IOS,
        push_token="ExponentPushToken[user-secondary]",
        is_active=True,
        is_primary=False,
    )

    result = send_push_to_user(
        user=patient,
        title="Ignored",
    )

    assert result["ok"] is False
    assert result["error_code"] == "no_active_primary_device"
    mock_send.assert_not_called()


@patch("apps.notifications.services.send_expo_push_notification")
def test_send_push_to_user_ignores_primary_device_without_token(mock_send, patient):
    UserDevice.objects.create(
        user=patient,
        device_id="push-user-no-token",
        platform=DevicePlatform.ANDROID,
        push_token=None,
        is_active=True,
        is_primary=True,
    )

    result = send_push_to_user(
        user=patient,
        title="Ignored",
    )

    assert result["ok"] is False
    assert result["error_code"] == "no_active_primary_device"
    mock_send.assert_not_called()


@patch("apps.notifications.services.send_expo_push_notification")
def test_send_push_to_user_uses_current_primary_after_primary_switch(
    mock_send,
    patient,
):
    old_device = register_user_device(
        user=patient,
        device_id="push-user-old-primary",
        platform=DevicePlatform.ANDROID,
        push_token="ExponentPushToken[user-old-primary]",
        is_primary=True,
    )

    new_device = register_user_device(
        user=patient,
        device_id="push-user-new-primary",
        platform=DevicePlatform.IOS,
        push_token="ExponentPushToken[user-new-primary]",
        is_primary=True,
    )

    old_device.refresh_from_db()

    assert old_device.is_primary is False
    assert new_device.is_primary is True

    mock_send.return_value = {
        "ok": True,
        "ticket_id": "ticket-new-primary",
        "error": None,
        "error_code": None,
    }

    send_push_to_user(
        user=patient,
        title="Primary switch",
    )

    mock_send.assert_called_once()
    assert (
        mock_send.call_args.kwargs["push_token"]
        == "ExponentPushToken[user-new-primary]"
    )


@patch("apps.notifications.services.send_expo_push_notification")
def test_send_push_to_user_returns_transport_result_unchanged(mock_send, patient):
    register_user_device(
        user=patient,
        device_id="push-user-provider-error",
        platform=DevicePlatform.ANDROID,
        push_token="ExponentPushToken[user-provider-error]",
        is_primary=True,
    )

    expected = {
        "ok": False,
        "ticket_id": None,
        "error": "provider failed",
        "error_code": "request_failed",
    }
    mock_send.return_value = expected

    result = send_push_to_user(
        user=patient,
        title="Provider failure",
    )

    assert result == expected

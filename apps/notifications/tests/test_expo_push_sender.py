import pytest
import requests
from django.test import override_settings
from unittest.mock import Mock, patch

from apps.notifications.models import DevicePlatform
from apps.notifications.services import (
    register_user_device,
    send_expo_push_notification,
)

pytestmark = pytest.mark.django_db


def _response_with_json(payload):
    response = Mock()
    response.raise_for_status.return_value = None
    response.json.return_value = payload
    return response


@patch("apps.notifications.services.requests.post")
def test_expo_push_success_returns_ticket_and_sends_expected_payload(mock_post):
    mock_post.return_value = _response_with_json(
        {
            "data": {
                "status": "ok",
                "id": "ticket-123",
            },
        },
    )

    result = send_expo_push_notification(
        push_token="ExponentPushToken[test-success]",
        title="New delivery",
        body="A delivery offer is waiting.",
        data={"offer_id": 42},
        priority="high",
    )

    assert result == {
        "ok": True,
        "ticket_id": "ticket-123",
        "error": None,
        "error_code": None,
    }

    mock_post.assert_called_once()

    _, kwargs = mock_post.call_args

    assert kwargs["json"] == {
        "to": "ExponentPushToken[test-success]",
        "title": "New delivery",
        "body": "A delivery offer is waiting.",
        "data": {"offer_id": 42},
        "sound": "default",
        "priority": "high",
    }
    assert kwargs["headers"]["Accept"] == "application/json"
    assert kwargs["headers"]["Content-Type"] == "application/json"
    assert "Authorization" not in kwargs["headers"]
    assert kwargs["timeout"] == 10


@override_settings(
    EXPO_ACCESS_TOKEN="secret-expo-token",
    EXPO_PUSH_TIMEOUT_SECONDS=4,
)
@patch("apps.notifications.services.requests.post")
def test_expo_push_uses_configured_access_token_and_timeout(mock_post):
    mock_post.return_value = _response_with_json(
        {
            "data": {
                "status": "ok",
                "id": "ticket-auth",
            },
        },
    )

    result = send_expo_push_notification(
        push_token="ExponentPushToken[test-auth]",
    )

    assert result["ok"] is True

    _, kwargs = mock_post.call_args

    assert kwargs["headers"]["Authorization"] == "Bearer secret-expo-token"
    assert kwargs["timeout"] == 4


@patch("apps.notifications.services.requests.post")
def test_expo_push_rejects_missing_token_without_http_request(mock_post):
    result = send_expo_push_notification(
        push_token="   ",
        title="Ignored",
    )

    assert result == {
        "ok": False,
        "ticket_id": None,
        "error": "Push token is required.",
        "error_code": "missing_push_token",
    }
    mock_post.assert_not_called()


@patch("apps.notifications.services.requests.post")
def test_expo_push_rejects_non_dictionary_data_without_http_request(mock_post):
    result = send_expo_push_notification(
        push_token="ExponentPushToken[test-invalid-data]",
        data=["not", "a", "dict"],
    )

    assert result == {
        "ok": False,
        "ticket_id": None,
        "error": "Push data must be a dictionary.",
        "error_code": "invalid_data",
    }
    mock_post.assert_not_called()


@patch("apps.notifications.services.requests.post")
def test_expo_push_handles_network_failure_without_raising(mock_post):
    mock_post.side_effect = requests.RequestException("network unavailable")

    result = send_expo_push_notification(
        push_token="ExponentPushToken[test-network]",
    )

    assert result["ok"] is False
    assert result["ticket_id"] is None
    assert result["error_code"] == "request_failed"
    assert "network unavailable" in result["error"]


@patch("apps.notifications.services.requests.post")
def test_expo_push_handles_invalid_json_response(mock_post):
    response = Mock()
    response.raise_for_status.return_value = None
    response.json.side_effect = ValueError("bad json")
    mock_post.return_value = response

    result = send_expo_push_notification(
        push_token="ExponentPushToken[test-json]",
    )

    assert result == {
        "ok": False,
        "ticket_id": None,
        "error": "Expo returned invalid JSON.",
        "error_code": "invalid_response",
    }


@patch("apps.notifications.services.requests.post")
def test_expo_push_handles_missing_ticket_payload(mock_post):
    mock_post.return_value = _response_with_json(
        {
            "data": None,
        },
    )

    result = send_expo_push_notification(
        push_token="ExponentPushToken[test-ticket]",
    )

    assert result == {
        "ok": False,
        "ticket_id": None,
        "error": "Expo response did not contain a valid push ticket.",
        "error_code": "invalid_ticket",
    }


@patch("apps.notifications.services.requests.post")
def test_expo_push_returns_provider_ticket_error_without_raising(mock_post):
    mock_post.return_value = _response_with_json(
        {
            "data": {
                "status": "error",
                "message": "Message payload is invalid.",
                "details": {
                    "error": "MessageTooBig",
                },
            },
        },
    )

    result = send_expo_push_notification(
        push_token="ExponentPushToken[test-provider-error]",
    )

    assert result == {
        "ok": False,
        "ticket_id": None,
        "error": "Message payload is invalid.",
        "error_code": "MessageTooBig",
    }


@patch("apps.notifications.services.requests.post")
def test_device_not_registered_deactivates_matching_device(mock_post, patient):
    device = register_user_device(
        user=patient,
        device_id="expo-unregistered-device",
        platform=DevicePlatform.ANDROID,
        push_token="ExponentPushToken[test-unregistered]",
        is_primary=True,
    )

    mock_post.return_value = _response_with_json(
        {
            "data": {
                "status": "error",
                "message": "The device is not registered.",
                "details": {
                    "error": "DeviceNotRegistered",
                },
            },
        },
    )

    result = send_expo_push_notification(
        push_token="ExponentPushToken[test-unregistered]",
    )

    assert result == {
        "ok": False,
        "ticket_id": None,
        "error": "The device is not registered.",
        "error_code": "DeviceNotRegistered",
    }

    device.refresh_from_db()

    assert device.push_token is None
    assert device.is_active is False
    assert device.is_primary is False


@patch("apps.notifications.services.requests.post")
def test_expo_push_accepts_single_ticket_inside_list(mock_post):
    mock_post.return_value = _response_with_json(
        {
            "data": [
                {
                    "status": "ok",
                    "id": "ticket-list-123",
                },
            ],
        },
    )

    result = send_expo_push_notification(
        push_token="ExponentPushToken[test-list]",
    )

    assert result == {
        "ok": True,
        "ticket_id": "ticket-list-123",
        "error": None,
        "error_code": None,
    }

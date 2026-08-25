import logging

import requests
from django.conf import settings
from django.utils import timezone

from .models import Notification, UserDevice

logger = logging.getLogger(__name__)

EXPO_PUSH_SEND_URL = "https://exp.host/--/api/v2/push/send"
DEFAULT_EXPO_PUSH_TIMEOUT_SECONDS = 10


def notify(*, user, type: str, title: str = '', body: str = '', **payload) -> Notification:
    """Single helper for creating in-app notifications.

    Future enhancement: fan out to push/email by reading user preferences
    here. Keeping all creation routed through this function makes that
    one-place change.
    """
    return Notification.objects.create(
        user=user,
        type=type,
        title=title,
        body=body,
        payload=payload,
    )



def send_expo_push_notification(
    *,
    push_token,
    title="",
    body="",
    data=None,
    sound="default",
    priority=None,
):
    """Send one notification through the Expo Push Service.

    This is a low-level transport helper. It does not create an in-app
    Notification and it does not allow provider/network failures to bubble
    into delivery business workflows.

    Returns:
        {
            "ok": bool,
            "ticket_id": str | None,
            "error": str | None,
            "error_code": str | None,
        }
    """
    push_token = (push_token or "").strip()

    if not push_token:
        return {
            "ok": False,
            "ticket_id": None,
            "error": "Push token is required.",
            "error_code": "missing_push_token",
        }

    if data is not None and not isinstance(data, dict):
        return {
            "ok": False,
            "ticket_id": None,
            "error": "Push data must be a dictionary.",
            "error_code": "invalid_data",
        }

    message = {"to": push_token}

    if title:
        message["title"] = title

    if body:
        message["body"] = body

    if data is not None:
        message["data"] = data

    if sound:
        message["sound"] = sound

    if priority:
        message["priority"] = priority

    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
    }

    access_token = str(
        getattr(settings, "EXPO_ACCESS_TOKEN", "") or ""
    ).strip()

    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"

    timeout = getattr(
        settings,
        "EXPO_PUSH_TIMEOUT_SECONDS",
        DEFAULT_EXPO_PUSH_TIMEOUT_SECONDS,
    )

    try:
        response = requests.post(
            EXPO_PUSH_SEND_URL,
            json=message,
            headers=headers,
            timeout=timeout,
        )
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException as exc:
        logger.warning(
            "Expo push request failed for token ending %s: %s",
            push_token[-12:],
            exc,
        )
        return {
            "ok": False,
            "ticket_id": None,
            "error": str(exc),
            "error_code": "request_failed",
        }
    except ValueError as exc:
        logger.warning(
            "Expo push returned invalid JSON for token ending %s: %s",
            push_token[-12:],
            exc,
        )
        return {
            "ok": False,
            "ticket_id": None,
            "error": "Expo returned invalid JSON.",
            "error_code": "invalid_response",
        }

    ticket = payload.get("data") if isinstance(payload, dict) else None

    if isinstance(ticket, list):
        ticket = ticket[0] if ticket else None

    if not isinstance(ticket, dict):
        return {
            "ok": False,
            "ticket_id": None,
            "error": "Expo response did not contain a valid push ticket.",
            "error_code": "invalid_ticket",
        }

    if ticket.get("status") == "ok":
        return {
            "ok": True,
            "ticket_id": ticket.get("id"),
            "error": None,
            "error_code": None,
        }

    details = ticket.get("details") or {}
    error_code = details.get("error") or "expo_ticket_error"
    error_message = (
        ticket.get("message")
        or "Expo rejected the push notification."
    )

    if error_code == "DeviceNotRegistered":
        UserDevice.objects.filter(push_token=push_token).update(
            push_token=None,
            is_active=False,
            is_primary=False,
            updated_at=timezone.now(),
        )

    logger.warning(
        "Expo push ticket error for token ending %s: %s (%s)",
        push_token[-12:],
        error_message,
        error_code,
    )

    return {
        "ok": False,
        "ticket_id": None,
        "error": error_message,
        "error_code": error_code,
    }



def send_push_to_user(
    *,
    user,
    title="",
    body="",
    data=None,
    sound="default",
    priority=None,
):
    """Send one push to the user's active primary mobile device.

    Returns a normal result dictionary even when the user has no eligible
    device, so business workflows can treat push delivery as best-effort.
    """
    device = (
        UserDevice.objects
        .filter(
            user=user,
            is_active=True,
            is_primary=True,
            push_token__isnull=False,
        )
        .exclude(push_token="")
        .order_by("-updated_at")
        .first()
    )

    if device is None:
        return {
            "ok": False,
            "ticket_id": None,
            "error": "No active primary push device is registered.",
            "error_code": "no_active_primary_device",
        }

    return send_expo_push_notification(
        push_token=device.push_token,
        title=title,
        body=body,
        data=data,
        sound=sound,
        priority=priority,
    )


def register_user_device(
    *,
    user,
    device_id,
    platform,
    push_token=None,
    app_version="",
    is_primary=True,
):
    """Register or refresh one authenticated mobile app installation.

    Registration is idempotent by ``device_id``. If the same installation is
    later used by another account, ownership is transferred to that account.
    A push token is also moved away from any stale device record before being
    assigned here.
    """
    from django.contrib.auth import get_user_model
    from django.db import transaction
    from django.utils import timezone
    from rest_framework.exceptions import ValidationError

    from .models import DevicePlatform, UserDevice

    User = get_user_model()

    device_id = (device_id or "").strip()
    push_token = (push_token or "").strip() or None
    app_version = (app_version or "").strip()

    if not device_id:
        raise ValidationError("device_id is required.")

    if platform not in DevicePlatform.values:
        raise ValidationError("Unsupported device platform.")

    with transaction.atomic():
        locked_user = (
            User.objects
            .select_for_update()
            .get(pk=user.pk)
        )

        device = (
            UserDevice.objects
            .select_for_update()
            .filter(device_id=device_id)
            .first()
        )

        if push_token is not None:
            stale_token_device = (
                UserDevice.objects
                .select_for_update()
                .filter(push_token=push_token)
                .exclude(
                    pk=device.pk if device is not None else None,
                )
                .first()
            )

            if stale_token_device is not None:
                stale_token_device.push_token = None
                stale_token_device.save(
                    update_fields=(
                        "push_token",
                        "updated_at",
                    ),
                )

        if is_primary:
            (
                UserDevice.objects
                .select_for_update()
                .filter(
                    user=locked_user,
                    is_active=True,
                    is_primary=True,
                )
                .exclude(
                    pk=device.pk if device is not None else None,
                )
                .update(
                    is_primary=False,
                    updated_at=timezone.now(),
                )
            )

        now = timezone.now()

        if device is None:
            device = UserDevice.objects.create(
                user=locked_user,
                device_id=device_id,
                platform=platform,
                push_token=push_token,
                app_version=app_version,
                is_active=True,
                is_primary=is_primary,
                last_seen_at=now,
            )
        else:
            device.user = locked_user
            device.platform = platform
            device.push_token = push_token
            device.app_version = app_version
            device.is_active = True
            device.is_primary = is_primary
            device.last_seen_at = now
            device.save(
                update_fields=(
                    "user",
                    "platform",
                    "push_token",
                    "app_version",
                    "is_active",
                    "is_primary",
                    "last_seen_at",
                    "updated_at",
                ),
            )

    return device


def deactivate_user_device(
    *,
    user,
    device_id,
):
    """Deactivate one mobile installation owned by the authenticated user."""
    from django.contrib.auth import get_user_model
    from django.db import transaction
    from django.utils import timezone
    from rest_framework.exceptions import ValidationError

    from .models import UserDevice

    User = get_user_model()

    device_id = (device_id or "").strip()

    if not device_id:
        raise ValidationError("device_id is required.")

    with transaction.atomic():
        locked_user = (
            User.objects
            .select_for_update()
            .get(pk=user.pk)
        )

        device = (
            UserDevice.objects
            .select_for_update()
            .filter(
                user=locked_user,
                device_id=device_id,
            )
            .first()
        )

        if device is None:
            raise ValidationError(
                "Device registration not found for this user."
            )

        device.push_token = None
        device.is_active = False
        device.is_primary = False
        device.last_seen_at = timezone.now()
        device.save(
            update_fields=(
                "push_token",
                "is_active",
                "is_primary",
                "last_seen_at",
                "updated_at",
            ),
        )

    return device


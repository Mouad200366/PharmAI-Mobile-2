import secrets
from datetime import timedelta

from django.contrib.auth.hashers import make_password
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.delivery.models import (
    DeliveryIncident,
    DeliveryIncidentStatus,
    DeliveryVerification,
    DeliveryVerificationType,
)


RETURN_VERIFICATION_TTL_MINUTES = 120


def _generate_return_pin():
    return f"{secrets.randbelow(1_000_000):06d}"


def _generate_return_qr_token():
    return secrets.token_urlsafe(32)


def issue_return_verification(
    *,
    incident_id,
    ttl_minutes=RETURN_VERIFICATION_TTL_MINUTES,
):
    """Create or rotate the one-time pharmacy return QR token and fallback PIN."""
    try:
        ttl_minutes = int(ttl_minutes)
    except (TypeError, ValueError):
        raise ValidationError(
            "Return verification lifetime must be a positive number of minutes.",
        )

    if ttl_minutes <= 0:
        raise ValidationError(
            "Return verification lifetime must be a positive number of minutes.",
        )

    qr_token = _generate_return_qr_token()
    pin = _generate_return_pin()
    expires_at = timezone.now() + timedelta(minutes=ttl_minutes)

    with transaction.atomic():
        incident = (
            DeliveryIncident.objects
            .select_for_update()
            .select_related("order")
            .filter(pk=incident_id)
            .first()
        )

        if incident is None:
            raise ValidationError(
                "Delivery incident not found.",
            )

        if incident.status not in (
            DeliveryIncidentStatus.RETURN_REQUIRED,
            DeliveryIncidentStatus.RETURNING,
        ):
            raise ValidationError(
                "Return verification can only be issued for a return-required or returning incident.",
            )

        if incident.order.delivery_agent_id is None:
            raise ValidationError(
                "A delivery agent must be assigned before return verification is issued.",
            )

        if incident.order.delivery_agent_id != incident.agent_id:
            raise ValidationError(
                "The incident agent does not match the order's assigned delivery agent.",
            )

        verification, _ = DeliveryVerification.objects.update_or_create(
            order=incident.order,
            verification_type=DeliveryVerificationType.RETURN,
            defaults={
                "qr_token_hash": make_password(qr_token),
                "pin_hash": make_password(pin),
                "expires_at": expires_at,
                "used_at": None,
                "verification_method": "",
                "verified_by": None,
                "verified_location": None,
                "failed_attempts": 0,
                "last_failed_at": None,
            },
        )

    return {
        "verification": verification,
        "qr_token": qr_token,
        "pin": pin,
        "expires_at": verification.expires_at,
    }

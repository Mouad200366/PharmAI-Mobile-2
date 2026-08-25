from django.contrib.auth.hashers import check_password
from django.contrib.gis.geos import Point
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.delivery.models import (
    DeliveryIncident,
    DeliveryIncidentStatus,
    DeliveryVerification,
    DeliveryVerificationMethod,
    DeliveryVerificationType,
)


RETURN_VERIFICATION_MAX_ATTEMPTS = 5


def _return_point(*, latitude, longitude):
    try:
        latitude = float(latitude)
        longitude = float(longitude)
    except (TypeError, ValueError):
        raise ValidationError(
            "Invalid return verification location.",
        )

    if not -90 <= latitude <= 90:
        raise ValidationError(
            "Invalid return verification latitude.",
        )

    if not -180 <= longitude <= 180:
        raise ValidationError(
            "Invalid return verification longitude.",
        )

    return Point(
        longitude,
        latitude,
        srid=4326,
    )


def verify_delivery_return(
    *,
    incident_id,
    agent,
    credential,
    method,
    latitude,
    longitude,
):
    if method not in (
        DeliveryVerificationMethod.PIN,
        DeliveryVerificationMethod.QR,
    ):
        raise ValidationError(
            "Invalid return verification method.",
        )

    point = _return_point(
        latitude=latitude,
        longitude=longitude,
    )

    credential_error = None

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

        if incident.agent_id != agent.id:
            raise PermissionDenied(
                "You are not the assigned delivery agent for this incident.",
            )

        if incident.status != DeliveryIncidentStatus.RETURNING:
            raise ValidationError(
                "This incident is not currently returning to the pharmacy.",
            )

        verification = (
            DeliveryVerification.objects
            .select_for_update()
            .filter(
                order=incident.order,
                verification_type=DeliveryVerificationType.RETURN,
            )
            .first()
        )

        if verification is None:
            raise ValidationError(
                "Return verification is not available for this order.",
            )

        if verification.used_at is not None:
            raise ValidationError(
                "This return verification has already been used.",
            )

        now = timezone.now()

        if verification.expires_at and verification.expires_at <= now:
            raise ValidationError(
                "This return verification has expired.",
            )

        if verification.failed_attempts >= RETURN_VERIFICATION_MAX_ATTEMPTS:
            raise ValidationError(
                "Too many failed return verification attempts.",
            )

        stored_hash = (
            verification.pin_hash
            if method == DeliveryVerificationMethod.PIN
            else verification.qr_token_hash
        )

        if not stored_hash:
            raise ValidationError(
                "The selected return verification method is not available.",
            )

        if not check_password(
            str(credential),
            stored_hash,
        ):
            verification.failed_attempts += 1
            verification.last_failed_at = now
            verification.save(
                update_fields=(
                    "failed_attempts",
                    "last_failed_at",
                    "updated_at",
                ),
            )
            credential_error = (
                "Invalid return verification credential."
            )
        else:
            verification.used_at = now
            verification.verification_method = method
            verification.verified_by = agent
            verification.verified_location = point
            verification.save(
                update_fields=(
                    "used_at",
                    "verification_method",
                    "verified_by",
                    "verified_location",
                    "updated_at",
                ),
            )

            incident.status = DeliveryIncidentStatus.RETURNED
            incident.save(
                update_fields=(
                    "status",
                    "updated_at",
                ),
            )

    if credential_error is not None:
        raise ValidationError(
            credential_error,
        )

    return incident
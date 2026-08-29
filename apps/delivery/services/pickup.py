import secrets
from datetime import timedelta

from django.contrib.auth.hashers import check_password, make_password
from django.contrib.gis.geos import Point
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.delivery.services.incident_guards import (
    UNRESOLVED_DELIVERY_INCIDENT_MESSAGE,
    ensure_no_unresolved_delivery_incident,
    has_unresolved_delivery_incident,
)
from apps.orders.constants import OrderStatus
from apps.orders.models import Order
from apps.orders.services.state_machine import transition

from ..models import (
    DeliveryVerification,
    DeliveryVerificationMethod,
    DeliveryVerificationType,
)


PICKUP_VERIFICATION_TTL_MINUTES = 30
PICKUP_VERIFICATION_MAX_ATTEMPTS = 5


def _generate_pin():
    return f'{secrets.randbelow(1_000_000):06d}'


def _generate_qr_token():
    return secrets.token_urlsafe(32)


def _point_from_coordinates(*, latitude, longitude):
    try:
        latitude = float(latitude)
        longitude = float(longitude)
    except (TypeError, ValueError):
        raise ValidationError(
            'A valid pickup latitude and longitude are required.',
        )

    if not -90 <= latitude <= 90:
        raise ValidationError(
            'Latitude must be between -90 and 90.',
        )

    if not -180 <= longitude <= 180:
        raise ValidationError(
            'Longitude must be between -180 and 180.',
        )

    return Point(
        longitude,
        latitude,
        srid=4326,
    )


def issue_pickup_verification(
    *,
    order,
    ttl_minutes=PICKUP_VERIFICATION_TTL_MINUTES,
):
    """Create or rotate the one-time pickup QR token and fallback PIN."""
    try:
        ttl_minutes = int(ttl_minutes)
    except (TypeError, ValueError):
        raise ValidationError(
            'Pickup verification lifetime must be a positive number of minutes.',
        )

    if ttl_minutes <= 0:
        raise ValidationError(
            'Pickup verification lifetime must be a positive number of minutes.',
        )

    qr_token = _generate_qr_token()
    pin = _generate_pin()
    expires_at = timezone.now() + timedelta(minutes=ttl_minutes)

    with transaction.atomic():
        locked_order = (
            Order.objects
            .select_for_update()
            .get(pk=order.pk)
        )

        if locked_order.status != OrderStatus.AWAITING_AGENT:
            raise ValidationError(
                'Pickup verification can only be issued while the order is awaiting its delivery agent.',
            )

        if locked_order.delivery_agent_id is None:
            raise ValidationError(
                'A delivery agent must accept the order before pickup verification is issued.',
            )

        ensure_no_unresolved_delivery_incident(
            order=locked_order,
        )

        verification, _ = DeliveryVerification.objects.update_or_create(
            order=locked_order,
            verification_type=DeliveryVerificationType.PICKUP,
            defaults={
                'qr_token_hash': make_password(qr_token),
                'pin_hash': make_password(pin),
                'expires_at': expires_at,
                'used_at': None,
                'verification_method': '',
                'verified_by': None,
                'verified_location': None,
                'failed_attempts': 0,
                'last_failed_at': None,
            },
        )

    return {
        'verification': verification,
        'qr_token': qr_token,
        'pin': pin,
        'expires_at': verification.expires_at,
    }


def verify_pickup(
    *,
    order_id,
    agent,
    method,
    credential,
    latitude,
    longitude,
):
    """Verify pharmacy pickup and transition the assigned order to picked_up."""
    if method not in {
        DeliveryVerificationMethod.QR,
        DeliveryVerificationMethod.PIN,
    }:
        raise ValidationError(
            'Pickup verification method must be qr or pin.',
        )

    credential = str(credential or '').strip()
    if not credential:
        raise ValidationError(
            'Pickup verification credential is required.',
        )

    pickup_location = _point_from_coordinates(
        latitude=latitude,
        longitude=longitude,
    )

    error = None
    verified = None

    with transaction.atomic():
        order = (
            Order.objects
            .select_for_update()
            .filter(pk=order_id)
            .first()
        )

        if order is None:
            error = ValidationError(
                'Order not found.',
            )
        elif order.delivery_agent_id != agent.id:
            error = ValidationError(
                'You are not the assigned delivery agent for this order.',
            )
        elif order.status != OrderStatus.AWAITING_AGENT:
            error = ValidationError(
                'This order is not awaiting pickup verification.',
            )
        elif has_unresolved_delivery_incident(order=order):
            error = ValidationError(
                UNRESOLVED_DELIVERY_INCIDENT_MESSAGE,
            )
        else:
            verification = (
                DeliveryVerification.objects
                .select_for_update()
                .filter(
                    order=order,
                    verification_type=DeliveryVerificationType.PICKUP,
                )
                .first()
            )

            if verification is None:
                error = ValidationError(
                    'Pickup verification has not been issued for this order.',
                )
            elif verification.used_at is not None:
                error = ValidationError(
                    'This pickup verification has already been used.',
                )
            elif verification.expires_at <= timezone.now():
                error = ValidationError(
                    'This pickup verification has expired.',
                )
            elif verification.failed_attempts >= PICKUP_VERIFICATION_MAX_ATTEMPTS:
                error = ValidationError(
                    'Too many failed pickup verification attempts.',
                )
            else:
                encoded = (
                    verification.qr_token_hash
                    if method == DeliveryVerificationMethod.QR
                    else verification.pin_hash
                )

                credential_matches = bool(encoded) and check_password(
                    credential,
                    encoded,
                )

                if not credential_matches:
                    verification.failed_attempts += 1
                    verification.last_failed_at = timezone.now()
                    verification.save(
                        update_fields=(
                            'failed_attempts',
                            'last_failed_at',
                            'updated_at',
                        )
                    )

                    if verification.failed_attempts >= PICKUP_VERIFICATION_MAX_ATTEMPTS:
                        error = ValidationError(
                            'Invalid pickup credential. Maximum verification attempts reached.',
                        )
                    else:
                        error = ValidationError(
                            'Invalid pickup credential.',
                        )
                else:
                    now = timezone.now()

                    verification.used_at = now
                    verification.verification_method = method
                    verification.verified_by = agent
                    verification.verified_location = pickup_location
                    verification.save(
                        update_fields=(
                            'used_at',
                            'verification_method',
                            'verified_by',
                            'verified_location',
                            'updated_at',
                        )
                    )

                    transition(
                        order,
                        OrderStatus.PICKED_UP,
                        by_user=agent,
                        note='Pickup verified by delivery agent.',
                    )

                    verified = verification

    if error is not None:
        raise error

    return verified
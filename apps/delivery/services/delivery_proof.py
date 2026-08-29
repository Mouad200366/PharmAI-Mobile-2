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
from apps.orders.constants import OrderStatus, PaymentMethod
from apps.orders.models import Order
from apps.orders.services.state_machine import transition
from apps.payments.constants import PaymentStatus
from apps.payments.models import Payment

from ..models import (
    DeliveryVerification,
    DeliveryVerificationMethod,
    DeliveryVerificationType,
)


DELIVERY_PIN_TTL_MINUTES = 120
DELIVERY_VERIFICATION_MAX_ATTEMPTS = 5


def _generate_delivery_pin():
    return f'{secrets.randbelow(1_000_000):06d}'


def _delivery_point(*, latitude, longitude):
    try:
        latitude = float(latitude)
        longitude = float(longitude)
    except (TypeError, ValueError):
        raise ValidationError(
            'A valid delivery latitude and longitude are required.',
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


def issue_delivery_pin(
    *,
    order_id,
    customer,
    ttl_minutes=DELIVERY_PIN_TTL_MINUTES,
):
    """Issue or rotate the customer's one-time delivery PIN."""
    try:
        ttl_minutes = int(ttl_minutes)
    except (TypeError, ValueError):
        raise ValidationError(
            'Delivery PIN lifetime must be a positive number of minutes.',
        )

    if ttl_minutes <= 0:
        raise ValidationError(
            'Delivery PIN lifetime must be a positive number of minutes.',
        )

    pin = _generate_delivery_pin()
    expires_at = timezone.now() + timedelta(minutes=ttl_minutes)

    with transaction.atomic():
        order = (
            Order.objects
            .select_for_update()
            .filter(pk=order_id)
            .first()
        )

        if order is None:
            raise ValidationError(
                'Order not found.',
            )

        if order.customer_id != customer.id:
            raise ValidationError(
                'You are not the customer for this order.',
            )

        if order.status != OrderStatus.OUT_FOR_DELIVERY:
            raise ValidationError(
                'Delivery PIN is available only while the order is out for delivery.',
            )

        if order.delivery_agent_id is None:
            raise ValidationError(
                'This order does not have an assigned delivery agent.',
            )

        ensure_no_unresolved_delivery_incident(
            order=order,
        )

        verification, _ = DeliveryVerification.objects.update_or_create(
            order=order,
            verification_type=DeliveryVerificationType.DELIVERY,
            defaults={
                'qr_token_hash': '',
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
        'pin': pin,
        'expires_at': verification.expires_at,
    }


def complete_delivery(
    *,
    order_id,
    agent,
    pin,
    latitude,
    longitude,
    cash_confirmed=False,
):
    """Verify proof of delivery and mark the order delivered."""
    pin = str(pin or '').strip()
    if not pin:
        raise ValidationError(
            'Delivery PIN is required.',
        )

    delivery_location = _delivery_point(
        latitude=latitude,
        longitude=longitude,
    )

    error = None
    completed_order = None

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
        elif order.status != OrderStatus.OUT_FOR_DELIVERY:
            error = ValidationError(
                'This order is not out for delivery.',
            )
        elif has_unresolved_delivery_incident(order=order):
            error = ValidationError(
                UNRESOLVED_DELIVERY_INCIDENT_MESSAGE,
            )
        else:
            payment = (
                Payment.objects
                .select_for_update()
                .filter(order=order)
                .first()
            )

            if payment is None:
                error = ValidationError(
                    'Payment record not found for this order.',
                )
            elif order.payment_method == PaymentMethod.CASH and not cash_confirmed:
                error = ValidationError(
                    'Cash collection must be confirmed before completing a COD delivery.',
                )
            elif (
                order.payment_method == PaymentMethod.CARD
                and payment.status != PaymentStatus.PAID
            ):
                error = ValidationError(
                    'Online payment is not confirmed as paid.',
                )
            else:
                verification = (
                    DeliveryVerification.objects
                    .select_for_update()
                    .filter(
                        order=order,
                        verification_type=DeliveryVerificationType.DELIVERY,
                    )
                    .first()
                )

                if verification is None:
                    error = ValidationError(
                        'Delivery PIN has not been issued for this order.',
                    )
                elif verification.used_at is not None:
                    error = ValidationError(
                        'This delivery verification has already been used.',
                    )
                elif verification.expires_at <= timezone.now():
                    error = ValidationError(
                        'This delivery PIN has expired.',
                    )
                elif verification.failed_attempts >= DELIVERY_VERIFICATION_MAX_ATTEMPTS:
                    error = ValidationError(
                        'Too many failed delivery PIN attempts.',
                    )
                elif not check_password(pin, verification.pin_hash):
                    verification.failed_attempts += 1
                    verification.last_failed_at = timezone.now()
                    verification.save(
                        update_fields=(
                            'failed_attempts',
                            'last_failed_at',
                            'updated_at',
                        )
                    )

                    if verification.failed_attempts >= DELIVERY_VERIFICATION_MAX_ATTEMPTS:
                        error = ValidationError(
                            'Invalid delivery PIN. Maximum verification attempts reached.',
                        )
                    else:
                        error = ValidationError(
                            'Invalid delivery PIN.',
                        )
                else:
                    now = timezone.now()

                    verification.used_at = now
                    verification.verification_method = DeliveryVerificationMethod.PIN
                    verification.verified_by = agent
                    verification.verified_location = delivery_location
                    verification.save(
                        update_fields=(
                            'used_at',
                            'verification_method',
                            'verified_by',
                            'verified_location',
                            'updated_at',
                        )
                    )

                    if order.payment_method == PaymentMethod.CASH:
                        payment.status = PaymentStatus.PAID
                        payment.paid_at = now
                        payment.save(
                            update_fields=(
                                'status',
                                'paid_at',
                                'updated_at',
                            )
                        )

                        from apps.delivery.models import (
                            AgentCashTransaction,
                            AgentCashTransactionType,
                        )

                        AgentCashTransaction.objects.create(
                            agent=agent,
                            order=order,
                            transaction_type=AgentCashTransactionType.COLLECTION,
                            amount=payment.amount,
                            currency=payment.currency,
                            note='COD cash collected on delivery.',
                        )

                    transition(
                        order,
                        OrderStatus.DELIVERED,
                        by_user=agent,
                        note='Delivery completed with customer PIN verification.',
                    )

                    from apps.delivery.models import (
                        DeliveryEarning,
                        DeliveryEarningStatus,
                    )

                    earning = (
                        DeliveryEarning.objects
                        .select_for_update()
                        .filter(order=order)
                        .first()
                    )

                    if (
                        earning is not None
                        and earning.status == DeliveryEarningStatus.PENDING
                    ):
                        earning.status = DeliveryEarningStatus.EARNED
                        earning.earned_at = now
                        earning.save(
                            update_fields=(
                                'status',
                                'earned_at',
                                'updated_at',
                            )
                        )

                    completed_order = order

    if error is not None:
        raise error

    return completed_order
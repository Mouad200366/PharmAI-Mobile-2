from django.db import transaction
from django.utils import timezone

from apps.orders.constants import OrderStatus, PrescriptionMode
from apps.orders.services.place_order import _try_assign_agent
from apps.orders.services.state_machine import transition
from apps.orders.services.stock import refund_stock

from ..constants import PaymentStatus
from ..models import Payment, ProcessedStripeEvent


@transaction.atomic
def handle_stripe_event(event: dict):
    """Idempotent dispatcher. Caller has already verified the signature.

    Stripe retries on 5xx, so we dedupe by event ID. Unknown event types are
    ignored (Stripe sends many we don't care about).
    """
    event_id = event['id']
    event_type = event['type']

    if ProcessedStripeEvent.objects.filter(event_id=event_id).exists():
        return False
    ProcessedStripeEvent.objects.create(event_id=event_id, event_type=event_type)

    handler = _HANDLERS.get(event_type)
    if handler:
        handler(event['data']['object'])
    return True


def _handle_payment_succeeded(intent: dict):
    try:
        payment = Payment.objects.select_related('order').get(
            provider_payment_id=intent['id'],
        )
    except Payment.DoesNotExist:
        return

    if payment.status == PaymentStatus.PAID:
        return  # double-processed defensively

    payment.status = PaymentStatus.PAID
    payment.paid_at = timezone.now()
    payment.raw_last_event = intent
    payment.save(update_fields=(
        'status', 'paid_at', 'raw_last_event', 'updated_at',
    ))

    order = payment.order
    if order.status == OrderStatus.PENDING_PAYMENT:
        next_status = (
            OrderStatus.PENDING_REVIEW
            if order.prescription_mode == PrescriptionMode.PHOTO
            else OrderStatus.ACCEPTED
        )
        transition(order, next_status)
        if next_status == OrderStatus.ACCEPTED:
            _try_assign_agent(order)


def _handle_payment_failed(intent: dict):
    try:
        payment = Payment.objects.select_related('order').get(
            provider_payment_id=intent['id'],
        )
    except Payment.DoesNotExist:
        return

    payment.status = PaymentStatus.FAILED
    payment.raw_last_event = intent
    payment.save(update_fields=('status', 'raw_last_event', 'updated_at'))

    order = payment.order
    if order.status == OrderStatus.PENDING_PAYMENT:
        transition(order, OrderStatus.CANCELLED)
        refund_stock(order)


_HANDLERS = {
    'payment_intent.succeeded': _handle_payment_succeeded,
    'payment_intent.payment_failed': _handle_payment_failed,
}

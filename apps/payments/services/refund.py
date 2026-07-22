from django.db import transaction

from apps.orders.constants import OrderStatus
from apps.orders.services.state_machine import TRANSITIONS, transition
from apps.orders.services.stock import refund_stock

from ..constants import PaymentProvider, PaymentStatus
from . import stripe_service


@transaction.atomic
def refund_order(order, *, reason: str = '', actor=None):
    """High-level cancellation. Reverses the payment + stock + status atomically.

    Behaviour by provider × status:
    - card paid    → Stripe refund + Payment.status=refunded + stock refund
    - card unpaid  → Payment.status=cancelled + stock refund (no money moved)
    - cash paid    → Payment.status=refunded + stock refund (rare, post-delivery)
    - cash unpaid  → Payment.status=cancelled + stock refund

    Order is moved to CANCELLED unless already in a terminal state.
    """
    payment = getattr(order, 'payment', None)

    # Refresh from DB — Django caches the reverse OneToOne after `Payment.objects
    # .create(order=order)`, so a stale in-memory object can hide a status update
    # made by a signal (e.g. cash-paid-on-delivery).
    if payment is not None:
        payment.refresh_from_db()

    if payment is not None:
        if payment.provider == PaymentProvider.CARD and payment.status == PaymentStatus.PAID:
            stripe_service.refund_payment(payment, reason=reason)
            payment.status = PaymentStatus.REFUNDED
        elif payment.status == PaymentStatus.PAID:
            payment.status = PaymentStatus.REFUNDED
        else:
            payment.status = PaymentStatus.CANCELLED
        payment.save(update_fields=('status', 'updated_at'))

    # Move order to CANCELLED if it still has any outbound transitions.
    if TRANSITIONS.get(order.status):
        transition(order, OrderStatus.CANCELLED, by_user=actor)

    refund_stock(order)

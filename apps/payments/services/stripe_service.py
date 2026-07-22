"""Thin wrapper around the Stripe Python SDK.

Centralised so the rest of the codebase doesn't import `stripe` directly —
makes mocking easy in tests and isolates the SDK upgrade surface.
"""
from decimal import Decimal

from django.conf import settings


def _client():
    """Lazy SDK access. Raises if STRIPE_SECRET_KEY is unset (likely a misconfig
    in dev — Stripe paths shouldn't fire when unconfigured)."""
    import stripe
    if not settings.STRIPE_SECRET_KEY:
        raise RuntimeError('STRIPE_SECRET_KEY is not configured.')
    stripe.api_key = settings.STRIPE_SECRET_KEY
    return stripe


def amount_to_minor(amount: Decimal, currency: str = 'MAD') -> int:
    """MAD → santimat (1 MAD = 100 santimat). Stripe expects integer minor units."""
    return int((Decimal(amount) * 100).to_integral_value())


def create_payment_intent(payment):
    """Create a fresh PaymentIntent on Stripe and persist its ID + status onto
    the Payment row. Returns the Stripe intent object."""
    s = _client()
    intent = s.PaymentIntent.create(
        amount=amount_to_minor(payment.amount, payment.currency),
        currency=payment.currency.lower(),
        metadata={
            'order_id': str(payment.order_id),
            'payment_id': str(payment.id),
        },
        automatic_payment_methods={'enabled': True},
    )
    from ..constants import PaymentStatus
    payment.provider_payment_id = intent.id
    payment.status = PaymentStatus.PROCESSING
    payment.save(update_fields=('provider_payment_id', 'status', 'updated_at'))
    return intent


def retrieve_payment_intent(intent_id: str):
    return _client().PaymentIntent.retrieve(intent_id)


def refund_payment(payment, *, reason: str = ''):
    """Issue a Stripe refund against the PaymentIntent stored on `payment`.
    Caller updates Payment.status afterwards."""
    s = _client()
    if not payment.provider_payment_id:
        raise RuntimeError('Cannot refund — no Stripe PaymentIntent on record.')
    return s.Refund.create(
        payment_intent=payment.provider_payment_id,
        metadata={'reason': reason} if reason else {},
    )

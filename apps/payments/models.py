from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.core.models import BaseModel

from .constants import PaymentProvider, PaymentStatus


class Payment(BaseModel):
    """One per order. Provider tracks how the customer paid (cash/card);
    status tracks where the money is in its lifecycle."""

    order = models.OneToOneField(
        'orders.Order',
        on_delete=models.PROTECT,
        related_name='payment',
    )
    provider = models.CharField(
        max_length=10, choices=PaymentProvider.choices,
    )
    provider_payment_id = models.CharField(
        max_length=200, blank=True,
        help_text=_('Stripe PaymentIntent ID for card payments. Empty for cash.'),
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3, default='MAD')
    status = models.CharField(
        max_length=20, choices=PaymentStatus.choices, default=PaymentStatus.PENDING,
    )
    paid_at = models.DateTimeField(null=True, blank=True)
    raw_last_event = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ('-created_at',)
        indexes = (
            models.Index(fields=('provider', 'status')),
            models.Index(fields=('provider_payment_id',)),
        )

    def __str__(self):
        return f'Payment for Order #{self.order_id} ({self.status})'


class ProcessedStripeEvent(models.Model):
    """Idempotency guard for Stripe webhooks. Stripe retries on 5xx; we dedupe
    by event ID so the same event can't be applied twice."""

    event_id = models.CharField(max_length=200, unique=True)
    event_type = models.CharField(max_length=100)
    processed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ('-processed_at',)

    def __str__(self):
        return f'{self.event_type} ({self.event_id})'

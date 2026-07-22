from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

from apps.orders.constants import OrderStatus
from apps.orders.models import Order

from .constants import PaymentProvider, PaymentStatus
from .models import Payment


@receiver(post_save, sender=Order)
def mark_cash_paid_on_delivery(sender, instance: Order, **kwargs):
    """When a cash order is delivered, auto-mark its Payment as paid.

    Card payments are marked paid by the Stripe webhook, not here.
    """
    if instance.status != OrderStatus.DELIVERED:
        return
    payment = (
        Payment.objects
        .filter(
            order=instance,
            provider=PaymentProvider.CASH,
            status=PaymentStatus.PENDING,
        )
        .first()
    )
    if payment is None:
        return
    payment.status = PaymentStatus.PAID
    payment.paid_at = timezone.now()
    payment.save(update_fields=('status', 'paid_at', 'updated_at'))

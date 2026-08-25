from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.orders.constants import OrderStatus
from apps.orders.models import Order

from .services.broadcast import broadcast_order_status_change


@receiver(post_save, sender=Order)
def push_status_change(
    sender,
    instance: Order,
    created: bool,
    update_fields=None,
    **kwargs,
):
    """Push order status changes and clean up obsolete delivery offers."""
    if created:
        return

    if update_fields is not None and 'status' not in update_fields:
        return

    broadcast_order_status_change(instance)

    if instance.status == OrderStatus.AWAITING_AGENT:
        return

    from apps.delivery.services.offers import cancel_pending_offers_for_order

    cancel_pending_offers_for_order(instance)
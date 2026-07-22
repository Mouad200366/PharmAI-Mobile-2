from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.orders.models import Order

from .services.broadcast import broadcast_order_status_change


@receiver(post_save, sender=Order)
def push_status_change(sender, instance: Order, created: bool, update_fields=None, **kwargs):
    """Push every status update to subscribed websocket clients.

    Filters by `update_fields` so we only fire for actual status writes — saves
    on noise from other fields (price snapshot, agent assignment, etc.) which
    have their own dedicated event types if needed later.
    """
    if created:
        return
    if update_fields is not None and 'status' not in update_fields:
        return
    broadcast_order_status_change(instance)

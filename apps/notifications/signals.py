from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.orders.constants import OrderStatus
from apps.orders.models import Order, Prescription
from apps.payments.constants import PaymentStatus
from apps.payments.models import Payment

from .constants import NotificationType
from .services import notify

# --- Status -> human-readable hooks ---

_STATUS_NOTIFICATIONS = {
    OrderStatus.ACCEPTED: ('Order accepted', 'Your order has been accepted.'),
    OrderStatus.PREPARING: ('Order preparing', 'The pharmacy is preparing your order.'),
    OrderStatus.READY_FOR_PICKUP: ('Order ready', 'Your order is ready and an agent will pick it up.'),
    OrderStatus.AWAITING_AGENT: ('Finding a courier', 'We are looking for a courier for your order.'),
    OrderStatus.PICKED_UP: ('Order picked up', 'Your courier picked up the order from the pharmacy.'),
    OrderStatus.OUT_FOR_DELIVERY: ('Out for delivery', 'Your order is on its way.'),
    OrderStatus.DELIVERED: ('Order delivered', 'Your order has been delivered.'),
    OrderStatus.CANCELLED: ('Order cancelled', 'Your order has been cancelled.'),
    OrderStatus.REJECTED: ('Order rejected', 'Your order was rejected.'),
    OrderStatus.FAILED: ('Delivery failed', 'Your order could not be completed.'),
}


@receiver(post_save, sender=Order)
def on_order_status_change(sender, instance: Order, created: bool, update_fields=None, **kwargs):
    if created:
        notify(
            user=instance.customer,
            type=NotificationType.ORDER_PLACED,
            title='Order placed',
            body='We received your order and are looking for a pharmacy.',
            order_id=instance.id,
        )
        return

    if update_fields is not None and 'status' not in update_fields:
        return

    title_body = _STATUS_NOTIFICATIONS.get(instance.status)
    if title_body is None:
        return
    title, body = title_body

    notif_type = (
        NotificationType.ORDER_DELIVERED if instance.status == OrderStatus.DELIVERED
        else NotificationType.ORDER_CANCELLED if instance.status == OrderStatus.CANCELLED
        else NotificationType.ORDER_STATUS_CHANGED
    )
    notify(
        user=instance.customer,
        type=notif_type,
        title=title,
        body=body,
        order_id=instance.id,
        status=instance.status,
    )


@receiver(post_save, sender=Prescription)
def on_prescription_status(sender, instance: Prescription, created: bool, **kwargs):
    if created or instance.verified_at is None:
        return
    if instance.status == 'approved':
        notify(
            user=instance.order.customer,
            type=NotificationType.PRESCRIPTION_APPROVED,
            title='Prescription approved',
            body='Your prescription was approved by the pharmacy.',
            order_id=instance.order_id,
        )
    elif instance.status == 'rejected':
        notify(
            user=instance.order.customer,
            type=NotificationType.PRESCRIPTION_REJECTED,
            title='Prescription rejected',
            body=instance.rejection_reason or 'Your prescription could not be approved.',
            order_id=instance.order_id,
        )


@receiver(post_save, sender=Payment)
def on_payment_status(sender, instance: Payment, created: bool, **kwargs):
    if created:
        return
    order = instance.order
    if instance.status == PaymentStatus.PAID:
        notify(
            user=order.customer,
            type=NotificationType.PAYMENT_SUCCEEDED,
            title='Payment received',
            body=f'Payment of {instance.amount} {instance.currency} confirmed.',
            order_id=order.id,
            amount=str(instance.amount),
        )
    elif instance.status == PaymentStatus.FAILED:
        notify(
            user=order.customer,
            type=NotificationType.PAYMENT_FAILED,
            title='Payment failed',
            body='We could not process your card payment.',
            order_id=order.id,
        )

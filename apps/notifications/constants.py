from django.db import models
from django.utils.translation import gettext_lazy as _


class NotificationType(models.TextChoices):
    ORDER_PLACED = 'order_placed', _('Order placed')
    ORDER_STATUS_CHANGED = 'order_status_changed', _('Order status changed')
    ORDER_DELIVERED = 'order_delivered', _('Order delivered')
    ORDER_CANCELLED = 'order_cancelled', _('Order cancelled')
    PRESCRIPTION_APPROVED = 'prescription_approved', _('Prescription approved')
    PRESCRIPTION_REJECTED = 'prescription_rejected', _('Prescription rejected')
    PAYMENT_SUCCEEDED = 'payment_succeeded', _('Payment succeeded')
    PAYMENT_FAILED = 'payment_failed', _('Payment failed')
    AGENT_ASSIGNED = 'agent_assigned', _('Delivery agent assigned')
    DELIVERY_OFFER_AVAILABLE = 'delivery_offer_available', _('Delivery offer available')

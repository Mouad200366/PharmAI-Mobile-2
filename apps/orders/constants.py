from django.db import models
from django.utils.translation import gettext_lazy as _


class OrderStatus(models.TextChoices):
    """Lifecycle of an order. Transitions are validated in services/state_machine.py."""

    PENDING_PAYMENT = 'pending_payment', _('Pending card payment')
    PENDING_REVIEW = 'pending_review', _('Pending prescription review')
    REJECTED = 'rejected', _('Rejected')
    ACCEPTED = 'accepted', _('Accepted')
    PREPARING = 'preparing', _('Preparing')
    READY_FOR_PICKUP = 'ready_for_pickup', _('Ready for pickup')
    AWAITING_AGENT = 'awaiting_agent', _('Awaiting delivery agent')
    PICKED_UP = 'picked_up', _('Picked up')
    OUT_FOR_DELIVERY = 'out_for_delivery', _('Out for delivery')
    DELIVERED = 'delivered', _('Delivered')
    CANCELLED = 'cancelled', _('Cancelled')
    FAILED = 'failed', _('Failed')


class PrescriptionMode(models.TextChoices):
    NONE = 'none', _('Not required')
    PHOTO = 'photo', _('Upload photo for review')
    PICKUP = 'pickup', _('Hand to delivery agent')


class PaymentMethod(models.TextChoices):
    CASH = 'cash', _('Cash on delivery')
    CARD = 'card', _('Card / online')


class PrescriptionStatus(models.TextChoices):
    PENDING = 'pending', _('Pending review')
    APPROVED = 'approved', _('Approved')
    REJECTED = 'rejected', _('Rejected')
    COLLECTED = 'collected', _('Collected from customer')

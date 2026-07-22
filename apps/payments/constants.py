from django.db import models
from django.utils.translation import gettext_lazy as _


class PaymentProvider(models.TextChoices):
    CASH = 'cash', _('Cash on delivery')
    CARD = 'card', _('Card / online')


class PaymentStatus(models.TextChoices):
    PENDING = 'pending', _('Pending')
    PROCESSING = 'processing', _('Processing')
    PAID = 'paid', _('Paid')
    FAILED = 'failed', _('Failed')
    REFUNDED = 'refunded', _('Refunded')
    CANCELLED = 'cancelled', _('Cancelled')

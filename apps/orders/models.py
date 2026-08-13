from decimal import Decimal

from django.contrib.gis.db import models as gis_models
from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.core.models import BaseModel

from .constants import OrderStatus, PaymentMethod, PrescriptionMode, PrescriptionStatus


class Order(BaseModel):
    customer = models.ForeignKey(
        'users.User', on_delete=models.PROTECT, related_name='orders',
    )
    pharmacy = models.ForeignKey(
        'pharmacies.Pharmacy',
        on_delete=models.PROTECT,
        related_name='orders',
        null=True, blank=True,
        help_text=_('Assigned by the order service after creation.'),
    )
    delivery_agent = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        related_name='delivery_assignments',
        null=True, blank=True,
        limit_choices_to={'role': 'delivery'},
    )

    delivery_address = models.CharField(_('delivery address'), max_length=500)
    delivery_location = gis_models.PointField(geography=True, srid=4326)

    items_total = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    delivery_fee = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    grand_total = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))

    status = models.CharField(
        max_length=24, choices=OrderStatus.choices, default=OrderStatus.PENDING_REVIEW,
    )
    prescription_mode = models.CharField(
        max_length=10, choices=PrescriptionMode.choices, default=PrescriptionMode.NONE,
    )
    payment_method = models.CharField(
        max_length=10, choices=PaymentMethod.choices, default=PaymentMethod.CASH,
    )
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ('-created_at',)
        indexes = (
            models.Index(fields=('customer', '-created_at')),
            models.Index(fields=('pharmacy', 'status')),
            models.Index(fields=('delivery_agent', 'status')),
            models.Index(fields=('status', '-created_at')),
        )

    def __str__(self):
        return f'Order #{self.pk} ({self.get_status_display()})'


class OrderStatusHistory(BaseModel):
    """Immutable record of every status reached by an order.

    The mobile application uses these records to display a truthful timeline
    with the real timestamp of each order step. ``changed_by`` is optional
    because some transitions are performed automatically by payment webhooks
    or background services.
    """

    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name='status_history',
    )
    status = models.CharField(
        max_length=24,
        choices=OrderStatus.choices,
    )
    changed_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        related_name='+',
        null=True,
        blank=True,
    )
    note = models.TextField(blank=True)

    class Meta:
        ordering = ('created_at', 'id')
        indexes = (
            models.Index(fields=('order', 'created_at')),
        )

    def __str__(self):
        return f'Order #{self.order_id}: {self.get_status_display()}'


class OrderItem(BaseModel):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    medicine = models.ForeignKey(
        'catalog.Medicine', on_delete=models.PROTECT, related_name='+',
    )
    quantity = models.PositiveIntegerField()
    # Snapshot of price at order time — pharmacy can update price afterwards
    # without changing historical orders.
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        constraints = (
            models.UniqueConstraint(
                fields=('order', 'medicine'), name='unique_order_medicine',
            ),
        )

    @property
    def line_total(self):
        return self.unit_price * self.quantity


class ChatMessage(BaseModel):
    """Customer ↔ delivery-agent messages tied to a specific order.

    Persisted via `OrderChatConsumer.receive_json`; HTTP fallback for history
    is `GET /api/orders/{id}/messages/`.
    """

    order = models.ForeignKey(
        'orders.Order', on_delete=models.CASCADE, related_name='messages',
    )
    sender = models.ForeignKey(
        'users.User', on_delete=models.PROTECT, related_name='+',
    )
    content = models.TextField()
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ('created_at',)
        indexes = (
            models.Index(fields=('order', 'created_at')),
        )


class Prescription(BaseModel):
    order = models.OneToOneField(
        Order, on_delete=models.CASCADE, related_name='prescription',
    )
    photo = models.ImageField(upload_to='prescriptions/%Y/%m/', blank=True, null=True)
    status = models.CharField(
        max_length=10, choices=PrescriptionStatus.choices,
        default=PrescriptionStatus.PENDING,
    )
    verified_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        related_name='+',
        null=True, blank=True,
    )
    rejection_reason = models.TextField(blank=True)
    verified_at = models.DateTimeField(null=True, blank=True)
from datetime import timedelta

from django.contrib.gis.db import models as gis_models
from django.db import models
from django.db.models import Q
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from apps.core.constants import UserRole
from apps.core.models import BaseModel


class DeliveryAgentWorkStatus(models.TextChoices):
    ACTIVE = 'active', _('Active')
    SUSPENDED = 'suspended', _('Suspended')


class DeliveryOfferStatus(models.TextChoices):
    PENDING = 'pending', _('Pending')
    ACCEPTED = 'accepted', _('Accepted')
    DECLINED = 'declined', _('Declined')
    EXPIRED = 'expired', _('Expired')
    CANCELLED = 'cancelled', _('Cancelled')


class DeliveryApplicationStatus(models.TextChoices):
    PENDING = 'pending', _('Pending review')
    APPROVED = 'approved', _('Approved')
    REJECTED = 'rejected', _('Rejected')


class DeliveryApplication(BaseModel):
    """Administrative onboarding record for a delivery-agent user.

    Identity and contact data remain on User. This model tracks only the
    delivery application review lifecycle.
    """

    user = models.ForeignKey(
        'users.User',
        on_delete=models.CASCADE,
        related_name='delivery_applications',
        limit_choices_to={'role': UserRole.DELIVERY},
    )
    status = models.CharField(
        max_length=20,
        choices=DeliveryApplicationStatus.choices,
        default=DeliveryApplicationStatus.PENDING,
    )
    submitted_at = models.DateTimeField(
        default=timezone.now,
    )
    reviewed_at = models.DateTimeField(
        null=True,
        blank=True,
    )
    reviewed_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reviewed_delivery_applications',
        limit_choices_to={'role': UserRole.ADMIN},
    )
    review_note = models.TextField(
        blank=True,
    )

    class Meta:
        verbose_name = _('delivery application')
        verbose_name_plural = _('delivery applications')
        ordering = ('-submitted_at',)
        indexes = (
            models.Index(fields=('status', 'submitted_at')),
        )
        constraints = (
            models.UniqueConstraint(
                fields=('user',),
                condition=Q(status=DeliveryApplicationStatus.PENDING),
                name='delivery_one_pending_application_per_user',
            ),
        )

    def __str__(self):
        return (
            f'Delivery application #{self.pk or "new"} - '
            f'{self.user.full_name} ({self.get_status_display()})'
        )


class DeliveryAgentProfile(BaseModel):
    """Operational state for an approved delivery-agent user.

    The profile stores the agent's work eligibility, online state, and latest
    known location. Delivery-specific business records such as offers,
    earnings, and incidents live in separate models.
    """

    user = models.OneToOneField(
        'users.User',
        on_delete=models.CASCADE,
        related_name='delivery_profile',
        limit_choices_to={'role': UserRole.DELIVERY},
    )

    # Administrative work state.
    work_status = models.CharField(
        max_length=10,
        choices=DeliveryAgentWorkStatus.choices,
        default=DeliveryAgentWorkStatus.ACTIVE,
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    suspended_at = models.DateTimeField(null=True, blank=True)
    suspension_reason = models.TextField(blank=True)

    # Availability and location state.
    is_online = models.BooleanField(default=False)
    current_location = gis_models.PointField(
        geography=True,
        srid=4326,
        null=True,
        blank=True,
    )
    location_updated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = _('delivery agent profile')
        verbose_name_plural = _('delivery agent profiles')
        indexes = (
            models.Index(fields=('work_status', 'is_online')),
            models.Index(fields=('is_online', 'location_updated_at')),
        )

    @property
    def can_work(self) -> bool:
        """Whether the agent is administratively allowed to perform deliveries."""
        return (
            self.work_status == DeliveryAgentWorkStatus.ACTIVE
            and self.approved_at is not None
        )

    def has_fresh_location(self, max_age_seconds: int = 300) -> bool:
        """True if an online agent reported location recently."""
        if (
            not self.is_online
            or self.current_location is None
            or self.location_updated_at is None
        ):
            return False

        return (
            timezone.now() - self.location_updated_at
            <= timedelta(seconds=max_age_seconds)
        )

    def __str__(self):
        availability = 'online' if self.is_online else 'offline'
        return (
            f'{self.user.full_name} — '
            f'{self.get_work_status_display()} — {availability}'
        )


class DeliveryOffer(BaseModel):
    """Short-lived dispatch offer sent to one delivery agent for one order.

    An offer never assigns the order by itself. The order's ``delivery_agent``
    is set only when a pending, unexpired offer is accepted successfully.
    """

    order = models.ForeignKey(
        'orders.Order',
        on_delete=models.CASCADE,
        related_name='delivery_offers',
    )
    agent = models.ForeignKey(
        'users.User',
        on_delete=models.CASCADE,
        related_name='delivery_offers',
        limit_choices_to={'role': UserRole.DELIVERY},
    )
    status = models.CharField(
        max_length=10,
        choices=DeliveryOfferStatus.choices,
        default=DeliveryOfferStatus.PENDING,
    )
    expires_at = models.DateTimeField()
    responded_at = models.DateTimeField(null=True, blank=True)
    earning_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
    )

    class Meta:
        ordering = ('-created_at',)
        indexes = (
            models.Index(fields=('agent', 'status')),
            models.Index(fields=('order', 'status')),
            models.Index(fields=('status', 'expires_at')),
        )
        constraints = (
            models.UniqueConstraint(
                fields=('agent',),
                condition=Q(status=DeliveryOfferStatus.PENDING),
                name='delivery_one_pending_offer_per_agent',
            ),
            models.UniqueConstraint(
                fields=('order',),
                condition=Q(status=DeliveryOfferStatus.PENDING),
                name='delivery_one_pending_offer_per_order',
            ),
            models.UniqueConstraint(
                fields=('order',),
                condition=Q(status=DeliveryOfferStatus.ACCEPTED),
                name='delivery_one_accepted_offer_per_order',
            ),
        )

    @property
    def is_expired(self) -> bool:
        """Whether a pending offer has passed its expiry time."""
        return (
            self.status == DeliveryOfferStatus.PENDING
            and self.expires_at <= timezone.now()
        )

    def __str__(self):
        return (
            f'Order #{self.order_id} → '
            f'{self.agent.full_name} ({self.get_status_display()})'
        )

class DeliveryVerificationType(models.TextChoices):
    PICKUP = 'pickup', _('Pickup')
    DELIVERY = 'delivery', _('Delivery')
    RETURN = 'return', _('Return')


class DeliveryVerificationMethod(models.TextChoices):
    QR = 'qr', _('QR code')
    PIN = 'pin', _('PIN')


class DeliveryVerification(BaseModel):
    # One-time hashed verification credential for delivery custody events.
    # Raw QR tokens and PINs must never be stored here.

    order = models.ForeignKey(
        'orders.Order',
        on_delete=models.CASCADE,
        related_name='delivery_verifications',
    )
    verification_type = models.CharField(
        max_length=20,
        choices=DeliveryVerificationType.choices,
    )

    qr_token_hash = models.CharField(
        max_length=128,
        blank=True,
    )
    pin_hash = models.CharField(
        max_length=128,
        blank=True,
    )

    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(
        null=True,
        blank=True,
    )
    verification_method = models.CharField(
        max_length=10,
        choices=DeliveryVerificationMethod.choices,
        blank=True,
    )

    verified_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='delivery_verifications_performed',
    )
    verified_location = gis_models.PointField(
        geography=True,
        srid=4326,
        null=True,
        blank=True,
    )

    failed_attempts = models.PositiveSmallIntegerField(
        default=0,
    )
    last_failed_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    class Meta:
        verbose_name = _('delivery verification')
        verbose_name_plural = _('delivery verifications')
        ordering = ('-created_at',)
        constraints = (
            models.UniqueConstraint(
                fields=('order', 'verification_type'),
                name='unique_delivery_verification_per_order_type',
            ),
        )
        indexes = (
            models.Index(
                fields=('verification_type', 'expires_at'),
            ),
            models.Index(
                fields=('order', 'verification_type'),
            ),
        )

    @property
    def is_used(self) -> bool:
        return self.used_at is not None

    @property
    def is_expired(self) -> bool:
        return timezone.now() >= self.expires_at

    @property
    def is_valid(self) -> bool:
        return not self.is_used and not self.is_expired

    def __str__(self):
        return (
            f'{self.get_verification_type_display()} verification '
            f'for order #{self.order_id}'
        )

class DeliveryEarningStatus(models.TextChoices):
    PENDING = 'pending', _('Pending')
    EARNED = 'earned', _('Earned')
    PAID = 'paid', _('Paid')
    CANCELLED = 'cancelled', _('Cancelled')


class DeliveryEarning(BaseModel):
    """Courier earning snapshot for one delivery order.

    This is intentionally separate from customer payment and COD cash held by
    the courier. The amount is snapshotted when the courier accepts the order,
    becomes earned only after successful delivery, and may be marked paid later.
    """

    order = models.OneToOneField(
        'orders.Order',
        on_delete=models.PROTECT,
        related_name='delivery_earning',
    )
    agent = models.ForeignKey(
        'users.User',
        on_delete=models.PROTECT,
        related_name='delivery_earnings',
        limit_choices_to={'role': UserRole.DELIVERY},
    )
    amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
    )
    currency = models.CharField(
        max_length=3,
        default='MAD',
    )
    status = models.CharField(
        max_length=20,
        choices=DeliveryEarningStatus.choices,
        default=DeliveryEarningStatus.PENDING,
    )
    earned_at = models.DateTimeField(
        null=True,
        blank=True,
    )
    paid_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ('-created_at',)
        indexes = (
            models.Index(fields=('agent', 'status')),
            models.Index(fields=('agent', 'created_at')),
        )
        constraints = (
            models.CheckConstraint(
                condition=models.Q(amount__gte=0),
                name='delivery_earning_amount_nonnegative',
            ),
        )

    def __str__(self):
        return (
            f'Delivery earning for Order #{self.order_id} '
            f'— {self.amount} {self.currency} ({self.status})'
        )

class AgentCashTransactionType(models.TextChoices):
    COLLECTION = 'collection', _('COD collection')
    SETTLEMENT = 'settlement', _('Cash settlement')
    ADJUSTMENT = 'adjustment', _('Adjustment')


class AgentCashTransaction(BaseModel):
    """Immutable-style ledger entry for cash held by a delivery agent.

    Positive amounts increase the cash the agent is holding.
    Negative amounts reduce it. Courier earnings are tracked separately in
    DeliveryEarning and must never be mixed into this ledger.
    """

    agent = models.ForeignKey(
        'users.User',
        on_delete=models.PROTECT,
        related_name='cash_transactions',
        limit_choices_to={'role': UserRole.DELIVERY},
    )
    order = models.ForeignKey(
        'orders.Order',
        on_delete=models.PROTECT,
        related_name='agent_cash_transactions',
        null=True,
        blank=True,
    )
    transaction_type = models.CharField(
        max_length=20,
        choices=AgentCashTransactionType.choices,
    )
    amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text=_(
            'Signed amount in MAD: collections are positive; settlements are negative.'
        ),
    )
    currency = models.CharField(
        max_length=3,
        default='MAD',
    )
    note = models.CharField(
        max_length=255,
        blank=True,
    )

    class Meta:
        ordering = ('-created_at',)
        indexes = (
            models.Index(fields=('agent', 'created_at')),
            models.Index(fields=('agent', 'transaction_type')),
        )
        constraints = (
            models.CheckConstraint(
                condition=~models.Q(amount=0),
                name='agent_cash_transaction_amount_nonzero',
            ),
            models.CheckConstraint(
                condition=(
                    ~models.Q(transaction_type='collection')
                    | models.Q(amount__gt=0)
                ),
                name='agent_cash_collection_positive',
            ),
            models.CheckConstraint(
                condition=(
                    ~models.Q(transaction_type='settlement')
                    | models.Q(amount__lt=0)
                ),
                name='agent_cash_settlement_negative',
            ),
            models.CheckConstraint(
                condition=(
                    ~models.Q(transaction_type='collection')
                    | models.Q(order__isnull=False)
                ),
                name='agent_cash_collection_requires_order',
            ),
            models.UniqueConstraint(
                fields=('order',),
                condition=models.Q(transaction_type='collection'),
                name='unique_agent_cash_collection_per_order',
            ),
        )

    def __str__(self):
        return (
            f'{self.agent_id} {self.transaction_type}: '
            f'{self.amount} {self.currency}'
        )

class CashSettlementStatus(models.TextChoices):
    PENDING = 'pending', _('Pending')
    COMPLETED = 'completed', _('Completed')
    CANCELLED = 'cancelled', _('Cancelled')


class CashSettlement(BaseModel):
    """Record of COD cash handed over by a delivery agent.

    Settlement history is separate from courier earnings. Completing a
    settlement will later create a matching negative cash-ledger transaction.
    """

    agent = models.ForeignKey(
        'users.User',
        on_delete=models.PROTECT,
        related_name='cash_settlements',
        limit_choices_to={'role': UserRole.DELIVERY},
    )
    amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
    )
    currency = models.CharField(
        max_length=3,
        default='MAD',
    )
    status = models.CharField(
        max_length=20,
        choices=CashSettlementStatus.choices,
        default=CashSettlementStatus.PENDING,
    )
    completed_at = models.DateTimeField(
        null=True,
        blank=True,
    )
    note = models.CharField(
        max_length=255,
        blank=True,
    )

    class Meta:
        ordering = ('-created_at',)
        indexes = (
            models.Index(fields=('agent', 'status')),
            models.Index(fields=('agent', 'created_at')),
        )
        constraints = (
            models.CheckConstraint(
                condition=models.Q(amount__gt=0),
                name='cash_settlement_amount_positive',
            ),
        )

    def __str__(self):
        return (
            f'Cash settlement #{self.id} — '
            f'{self.amount} {self.currency} ({self.status})'
        )


class DeliveryIncidentReason(models.TextChoices):
    CUSTOMER_UNREACHABLE = "customer_unreachable", "Customer unreachable"
    CUSTOMER_REFUSED = "customer_refused", "Customer refused delivery"
    WRONG_ADDRESS = "wrong_address", "Wrong address"
    PAYMENT_ISSUE = "payment_issue", "Payment issue"
    DELIVERY_PIN_ISSUE = "delivery_pin_issue", "Delivery PIN issue"
    PACKAGE_DAMAGED = "package_damaged", "Package damaged"
    PACKAGE_MISSING = "package_missing", "Package missing"
    VEHICLE_PROBLEM = "vehicle_problem", "Temporary transport problem"
    AGENT_EMERGENCY = "agent_emergency", "Agent emergency"
    UNSAFE_SITUATION = "unsafe_situation", "Unsafe situation"
    OTHER = "other", "Other"


class DeliveryIncidentStatus(models.TextChoices):
    OPEN = "open", "Open"
    RESOLVED_CONTINUE = "resolved_continue", "Resolved — continue delivery"
    RETURN_REQUIRED = "return_required", "Return required"
    RETURNING = "returning", "Returning to pharmacy"
    RETURNED = "returned", "Returned to pharmacy"
    RESOLVED = "resolved", "Resolved"


class DeliveryIncident(BaseModel):
    order = models.ForeignKey(
        "orders.Order",
        on_delete=models.PROTECT,
        related_name="delivery_incidents",
    )
    agent = models.ForeignKey(
        "users.User",
        on_delete=models.PROTECT,
        related_name="delivery_incidents",
        limit_choices_to={"role": "delivery"},
    )
    reason = models.CharField(
        max_length=32,
        choices=DeliveryIncidentReason.choices,
    )
    status = models.CharField(
        max_length=32,
        choices=DeliveryIncidentStatus.choices,
        default=DeliveryIncidentStatus.OPEN,
    )
    reported_order_status = models.CharField(
        max_length=32,
        help_text="Order status captured when the incident was reported.",
    )
    details = models.TextField(
        blank=True,
    )
    resolution_note = models.TextField(
        blank=True,
    )
    resolved_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ("-created_at", "-id")
        indexes = [
            models.Index(
                fields=("order", "status"),
                name="delivery_inc_order_status_idx",
            ),
            models.Index(
                fields=("agent", "status"),
                name="delivery_inc_agent_status_idx",
            ),
            models.Index(
                fields=("status", "created_at"),
                name="deliv_inc_status_created_idx",
            ),
        ]

    def __str__(self):
        return (
            f"Delivery incident #{self.pk or 'new'} "
            f"for order #{self.order_id}"
        )


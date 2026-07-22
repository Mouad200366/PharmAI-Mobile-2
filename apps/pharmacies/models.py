from django.contrib.gis.db import models as gis_models
from django.db import models
from django.db.models import Exists, F, OuterRef, Q
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from phonenumber_field.modelfields import PhoneNumberField

from apps.core.constants import UserRole
from apps.core.models import BaseModel


class PharmacyQuerySet(models.QuerySet):
    def open_now(self, at=None):
        """Pharmacies open right now: regular hours OR active night shift.

        Defined here (not in services/) so it can chain into any pharmacy
        queryset — order routing in Phase 4 needs `Pharmacy.objects.open_now()
        .filter(stocks__medicine__in=...)`.
        """
        now = at or timezone.now()
        current_time = timezone.localtime(now).time()
        active_shift = NightShift.objects.filter(
            pharmacy=OuterRef('pk'),
            starts_at__lte=now,
            ends_at__gte=now,
        )
        regular_q = Q(opens_at__lte=current_time, closes_at__gte=current_time)
        return self.annotate(
            _has_active_night_shift=Exists(active_shift),
        ).filter(regular_q | Q(_has_active_night_shift=True))


class Pharmacy(BaseModel):
    owner = models.OneToOneField(
        'users.User',
        on_delete=models.CASCADE,
        related_name='pharmacy',
        limit_choices_to={'role': UserRole.PHARMACIST},
    )
    name = models.CharField(_('name'), max_length=200)
    license_number = models.CharField(_('license number'), max_length=100, unique=True)
    phone = PhoneNumberField(_('phone'), region='MA')
    address = models.CharField(_('address'), max_length=500)
    location = gis_models.PointField(_('location'), geography=True, srid=4326)
    opens_at = models.TimeField(_('opens at'))
    closes_at = models.TimeField(_('closes at'))
    is_active = models.BooleanField(_('active'), default=True)
    is_verified = models.BooleanField(_('verified'), default=False)

    objects = PharmacyQuerySet.as_manager()

    class Meta:
        ordering = ('name',)
        verbose_name = _('pharmacy')
        verbose_name_plural = _('pharmacies')
        indexes = (
            models.Index(fields=('is_active', 'is_verified')),
        )

    def __str__(self):
        return self.name


class PharmacyStock(BaseModel):
    pharmacy = models.ForeignKey(
        Pharmacy, on_delete=models.CASCADE, related_name='stocks',
    )
    medicine = models.ForeignKey(
        'catalog.Medicine', on_delete=models.PROTECT, related_name='stocks',
    )
    price = models.DecimalField(_('price'), max_digits=10, decimal_places=2)
    quantity = models.PositiveIntegerField(_('quantity'), default=0)
    is_available = models.BooleanField(_('available'), default=True)

    class Meta:
        verbose_name = _('pharmacy stock')
        verbose_name_plural = _('pharmacy stocks')
        constraints = (
            models.UniqueConstraint(
                fields=('pharmacy', 'medicine'), name='unique_pharmacy_medicine',
            ),
        )
        indexes = (
            models.Index(fields=('medicine', 'is_available')),
        )

    @property
    def in_stock(self):
        return self.is_available and self.quantity > 0

    def __str__(self):
        return f'{self.pharmacy.name} – {self.medicine.name}'


class NightShift(BaseModel):
    """Garde de nuit assignment — pharmacy stays open during the given window
    even if it falls outside its regular hours."""

    pharmacy = models.ForeignKey(
        Pharmacy, on_delete=models.CASCADE, related_name='night_shifts',
    )
    starts_at = models.DateTimeField(_('starts at'))
    ends_at = models.DateTimeField(_('ends at'))
    notes = models.TextField(_('notes'), blank=True)
    created_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
        help_text=_('Admin who assigned this shift.'),
    )

    class Meta:
        ordering = ('-starts_at',)
        verbose_name = _('night shift')
        verbose_name_plural = _('night shifts')
        constraints = (
            models.CheckConstraint(
                condition=Q(ends_at__gt=F('starts_at')),
                name='nightshift_ends_after_starts',
            ),
        )
        indexes = (
            # Composite covers per-pharmacy listings AND active-now lookups.
            models.Index(fields=('pharmacy', 'starts_at', 'ends_at')),
            models.Index(fields=('starts_at', 'ends_at')),
        )

    def __str__(self):
        return f'{self.pharmacy.name} — {self.starts_at:%Y-%m-%d %H:%M}'

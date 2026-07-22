from datetime import timedelta

from django.contrib.gis.db import models as gis_models
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from apps.core.constants import UserRole
from apps.core.models import BaseModel


class DeliveryAgentProfile(BaseModel):
    """Per-user delivery agent state. Created on demand the first time a user
    with role=DELIVERY toggles online or updates their location."""

    user = models.OneToOneField(
        'users.User',
        on_delete=models.CASCADE,
        related_name='delivery_profile',
        limit_choices_to={'role': UserRole.DELIVERY},
    )
    is_online = models.BooleanField(default=False)
    current_location = gis_models.PointField(geography=True, srid=4326, null=True, blank=True)
    location_updated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = _('delivery agent profile')
        verbose_name_plural = _('delivery agent profiles')
        indexes = (
            models.Index(fields=('is_online', 'location_updated_at')),
        )

    def has_fresh_location(self, max_age_seconds: int = 300) -> bool:
        """True if the agent reported their location within `max_age_seconds`."""
        if not self.is_online or self.current_location is None or self.location_updated_at is None:
            return False
        return timezone.now() - self.location_updated_at <= timedelta(seconds=max_age_seconds)

    def __str__(self):
        return f'{self.user.full_name} — {"online" if self.is_online else "offline"}'

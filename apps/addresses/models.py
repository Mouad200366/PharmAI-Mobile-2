from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.core.models import BaseModel


class Address(BaseModel):
    user = models.ForeignKey(
        'users.User',
        on_delete=models.CASCADE,
        related_name='addresses',
    )
    label = models.CharField(_('label'), max_length=40, default='home')
    street = models.CharField(_('street'), max_length=255)
    city = models.CharField(_('city'), max_length=80)
    postal_code = models.CharField(_('postal code'), max_length=10, blank=True)
    latitude = models.DecimalField(
        _('latitude'), max_digits=9, decimal_places=6,
    )
    longitude = models.DecimalField(
        _('longitude'), max_digits=9, decimal_places=6,
    )
    is_default = models.BooleanField(_('default'), default=False)

    class Meta:
        ordering = ('-is_default', 'label')
        verbose_name = _('address')
        verbose_name_plural = _('addresses')

    def __str__(self):
        return f'{self.label} - {self.city}'

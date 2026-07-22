from django.contrib.postgres.indexes import GinIndex
from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.core.models import BaseModel


class Medicine(BaseModel):
    name = models.CharField(_('name'), max_length=200, db_index=True)
    generic_name = models.CharField(
        _('generic name'), max_length=200, blank=True, db_index=True,
    )
    description = models.TextField(_('description'), blank=True)
    manufacturer = models.CharField(_('manufacturer'), max_length=200, blank=True)
    requires_prescription = models.BooleanField(
        _('requires prescription'), default=False,
    )
    image = models.ImageField(
        _('image'), upload_to='medicines/', blank=True, null=True,
    )
    is_active = models.BooleanField(_('active'), default=True)

    class Meta:
        ordering = ('name',)
        verbose_name = _('medicine')
        verbose_name_plural = _('medicines')
        # Trigram indexes are physically created in migration 0002_pg_trgm;
        # declared here so model state matches migration state and
        # makemigrations doesn't treat them as drift. Lists (not tuples) match
        # the migration's serialised form — Django serialises tuples as lists,
        # so a tuple here would be re-serialised and miscompared.
        indexes = [
            GinIndex(
                fields=['name'],
                name='medicine_name_trgm_idx',
                opclasses=['gin_trgm_ops'],
            ),
            GinIndex(
                fields=['generic_name'],
                name='medicine_generic_trgm_idx',
                opclasses=['gin_trgm_ops'],
            ),
        ]

    def __str__(self):
        return self.name

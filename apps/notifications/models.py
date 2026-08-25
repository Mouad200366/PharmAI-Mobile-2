from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.core.models import BaseModel

from .constants import NotificationType


class Notification(BaseModel):
    """In-app notification. Pushed via signals from other apps; future Phase
    can fan out to push/email by adding more handlers in the same module."""

    user = models.ForeignKey(
        'users.User', on_delete=models.CASCADE, related_name='notifications',
    )
    type = models.CharField(max_length=32, choices=NotificationType.choices)
    title = models.CharField(max_length=200, blank=True)
    body = models.TextField(blank=True)
    payload = models.JSONField(default=dict, blank=True)
    read_at = models.DateTimeField(_('read at'), null=True, blank=True)

    class Meta:
        ordering = ('-created_at',)
        indexes = (
            models.Index(fields=('user', '-created_at')),
            models.Index(fields=('user', 'read_at')),
        )

    @property
    def is_read(self) -> bool:
        return self.read_at is not None


class DevicePlatform(models.TextChoices):
    ANDROID = 'android', _('Android')
    IOS = 'ios', _('iOS')


class UserDevice(BaseModel):
    """Registered mobile app installation for push delivery.

    ``device_id`` must be an app-generated installation identifier, not a
    hardware identifier. Push tokens may rotate over time and are updated by
    the authenticated registration endpoint.
    """

    user = models.ForeignKey(
        'users.User',
        on_delete=models.CASCADE,
        related_name='devices',
    )
    device_id = models.CharField(
        max_length=128,
        unique=True,
    )
    platform = models.CharField(
        max_length=16,
        choices=DevicePlatform.choices,
    )
    push_token = models.CharField(
        max_length=255,
        unique=True,
        null=True,
        blank=True,
    )
    app_version = models.CharField(
        max_length=32,
        blank=True,
    )
    is_active = models.BooleanField(
        default=True,
    )
    is_primary = models.BooleanField(
        default=False,
    )
    last_seen_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    class Meta:
        verbose_name = _('user device')
        verbose_name_plural = _('user devices')
        ordering = ('-updated_at',)
        indexes = (
            models.Index(fields=('user', 'is_active')),
            models.Index(fields=('user', 'is_primary')),
        )
        constraints = (
            models.UniqueConstraint(
                fields=('user',),
                condition=models.Q(
                    is_primary=True,
                    is_active=True,
                ),
                name='notifications_one_active_primary_device_per_user',
            ),
        )

    def __str__(self):
        return (
            f'{self.user.full_name} - '
            f'{self.get_platform_display()} - {self.device_id}'
        )


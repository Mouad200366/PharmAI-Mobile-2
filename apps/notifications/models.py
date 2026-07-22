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

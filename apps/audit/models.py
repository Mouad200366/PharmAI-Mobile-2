from django.db import models
from django.utils.translation import gettext_lazy as _


class AuditLog(models.Model):
    """Append-only log of sensitive admin/staff actions for compliance.

    `target_type` stores the model name; `target_id` is a string so int and
    UUID PKs both fit. `metadata` is a free-form JSON bag for action-specific
    context (rejection reasons, prior values, etc).
    """

    actor = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='+',
    )
    action = models.CharField(_('action'), max_length=100)
    target_type = models.CharField(_('target type'), max_length=100)
    target_id = models.CharField(_('target id'), max_length=200)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ('-created_at',)
        indexes = (
            models.Index(fields=('actor', '-created_at')),
            models.Index(fields=('target_type', 'target_id', '-created_at')),
            models.Index(fields=('action', '-created_at')),
        )

    def __str__(self):
        actor = self.actor.phone if self.actor else 'system'
        return f'{actor} {self.action} {self.target_type}#{self.target_id}'

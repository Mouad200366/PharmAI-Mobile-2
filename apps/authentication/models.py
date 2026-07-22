from django.db import models
from django.utils import timezone
from phonenumber_field.modelfields import PhoneNumberField

from apps.core.constants import OTPPurpose


class OTPCode(models.Model):
    phone = PhoneNumberField(region='MA', db_index=True)
    code = models.CharField(max_length=10)
    purpose = models.CharField(
        max_length=20,
        choices=OTPPurpose.choices,
        default=OTPPurpose.SIGNUP,
    )
    attempts = models.PositiveSmallIntegerField(default=0)
    is_used = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    class Meta:
        ordering = ('-created_at',)
        indexes = [models.Index(fields=['phone', 'purpose', 'is_used'])]

    def is_valid(self) -> bool:
        return not self.is_used and self.expires_at > timezone.now()

    def __str__(self):
        return f'OTP {self.phone} ({self.purpose})'

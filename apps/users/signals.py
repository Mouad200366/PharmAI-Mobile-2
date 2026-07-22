import logging

from django.db.models.signals import pre_save
from django.dispatch import receiver

from .models import User

logger = logging.getLogger(__name__)


@receiver(pre_save, sender=User)
def log_phone_verification(sender, instance, **kwargs):
    """Log when a user's phone gets verified for the first time."""
    if not instance.pk:
        return
    try:
        previous = User.objects.get(pk=instance.pk)
    except User.DoesNotExist:
        return
    if not previous.is_phone_verified and instance.is_phone_verified:
        logger.info('Phone verified for user %s (%s)', instance.pk, instance.phone)

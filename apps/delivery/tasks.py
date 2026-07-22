from datetime import timedelta

from celery import shared_task
from django.db.models import Q
from django.utils import timezone

from .models import DeliveryAgentProfile

STALE_THRESHOLD_SECONDS = 300  # 5 minutes — matches agent_selection.max_age_seconds default


@shared_task
def mark_stale_agents_offline():
    """Flip `is_online=False` for any agent whose last location ping is older
    than `STALE_THRESHOLD_SECONDS`. Prevents stale agents from being auto-assigned."""
    cutoff = timezone.now() - timedelta(seconds=STALE_THRESHOLD_SECONDS)
    updated = DeliveryAgentProfile.objects.filter(is_online=True).filter(
        Q(location_updated_at__lt=cutoff) | Q(location_updated_at__isnull=True),
    ).update(is_online=False)
    return {'marked_offline': updated}

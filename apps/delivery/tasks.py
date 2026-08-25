from datetime import timedelta

from celery import shared_task
from django.db.models import Q
from django.utils import timezone

from .models import DeliveryAgentProfile


STALE_THRESHOLD_SECONDS = 300


@shared_task
def mark_stale_agents_offline():
    """Mark online agents offline when their last GPS update is too old."""
    cutoff = timezone.now() - timedelta(
        seconds=STALE_THRESHOLD_SECONDS,
    )

    updated = (
        DeliveryAgentProfile.objects
        .filter(is_online=True)
        .filter(
            Q(location_updated_at__lt=cutoff)
            | Q(location_updated_at__isnull=True)
        )
        .update(is_online=False)
    )

    return {
        'marked_offline': updated,
    }


@shared_task
def expire_stale_delivery_offers():
    """Expire overdue delivery offers and re-dispatch eligible orders."""
    from .services.offers import expire_stale_offers

    return expire_stale_offers()
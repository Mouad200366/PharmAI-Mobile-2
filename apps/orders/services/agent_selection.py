from datetime import timedelta

from django.contrib.gis.db.models.functions import Distance
from django.contrib.gis.measure import D
from django.utils import timezone

from apps.delivery.models import DeliveryAgentProfile

from ..models import Order
from .state_machine import ACTIVE_AGENT_STATUSES


def select_agent_for_order(
    pharmacy_location,
    *,
    max_distance_m: int = 10_000,
    max_age_seconds: int = 300,
):
    """Find the nearest agent who is online, has a fresh location ping
    (< `max_age_seconds` ago), is not currently engaged with another order,
    and is within `max_distance_m` of the pharmacy.

    Returns a `User` or `None`.
    """
    fresh_cutoff = timezone.now() - timedelta(seconds=max_age_seconds)

    busy_agent_ids = (
        Order.objects
        .filter(status__in=ACTIVE_AGENT_STATUSES, delivery_agent__isnull=False)
        .values_list('delivery_agent_id', flat=True)
    )

    profile = (
        DeliveryAgentProfile.objects
        .select_related('user')
        .filter(
            is_online=True,
            current_location__isnull=False,
            location_updated_at__gte=fresh_cutoff,
            current_location__distance_lte=(pharmacy_location, D(m=max_distance_m)),
        )
        .exclude(user_id__in=busy_agent_ids)
        .annotate(distance=Distance('current_location', pharmacy_location))
        .order_by('distance')
        .first()
    )
    return profile.user if profile else None

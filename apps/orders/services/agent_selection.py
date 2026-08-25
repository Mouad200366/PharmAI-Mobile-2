from datetime import timedelta

from django.contrib.gis.db.models.functions import Distance
from django.contrib.gis.measure import D
from django.utils import timezone

from apps.delivery.models import (
    DeliveryAgentProfile,
    DeliveryAgentWorkStatus,
    DeliveryOffer,
    DeliveryOfferStatus,
)

from ..models import Order
from .state_machine import ACTIVE_AGENT_STATUSES


def select_agent_for_order(
    pharmacy_location,
    *,
    max_distance_m: int = 10_000,
    max_age_seconds: int = 300,
    exclude_agent_ids=None,
):
    """Find the nearest delivery agent currently eligible for dispatch.

    Eligible agents must:
    - have an active delivery work status,
    - be approved for delivery work,
    - be online,
    - have a fresh location,
    - be within the configured pharmacy radius,
    - not already be engaged with another active order,
    - not already have another pending delivery offer,
    - not be explicitly excluded for this dispatch attempt.

    Returns a User or None.
    """
    fresh_cutoff = timezone.now() - timedelta(seconds=max_age_seconds)
    excluded_ids = tuple(exclude_agent_ids or ())

    busy_agent_ids = (
        Order.objects
        .filter(
            status__in=ACTIVE_AGENT_STATUSES,
            delivery_agent__isnull=False,
        )
        .values_list('delivery_agent_id', flat=True)
    )

    pending_offer_agent_ids = (
        DeliveryOffer.objects
        .filter(status=DeliveryOfferStatus.PENDING)
        .values_list('agent_id', flat=True)
    )

    profiles = (
        DeliveryAgentProfile.objects
        .select_related('user')
        .filter(
            work_status=DeliveryAgentWorkStatus.ACTIVE,
            approved_at__isnull=False,
            is_online=True,
            current_location__isnull=False,
            location_updated_at__gte=fresh_cutoff,
            current_location__distance_lte=(
                pharmacy_location,
                D(m=max_distance_m),
            ),
        )
        .exclude(user_id__in=busy_agent_ids)
        .exclude(user_id__in=pending_offer_agent_ids)
    )

    if excluded_ids:
        profiles = profiles.exclude(user_id__in=excluded_ids)

    profile = (
        profiles
        .annotate(
            distance=Distance(
                'current_location',
                pharmacy_location,
            )
        )
        .order_by('distance')
        .first()
    )

    return profile.user if profile else None
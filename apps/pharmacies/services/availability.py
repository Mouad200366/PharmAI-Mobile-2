from django.db.models import Exists, OuterRef, Q
from django.utils import timezone

from ..models import NightShift, Pharmacy


def _now_and_local_time(now=None):
    now = now or timezone.now()
    return now, timezone.localtime(now).time()


def is_open_now(pharmacy: Pharmacy, now=None) -> tuple[bool, str | None]:
    """Returns (is_open, reason) where reason is 'regular' | 'night_shift' | None."""
    now, current_time = _now_and_local_time(now)
    if pharmacy.opens_at <= current_time <= pharmacy.closes_at:
        return True, 'regular'
    has_shift = pharmacy.night_shifts.filter(
        starts_at__lte=now, ends_at__gte=now,
    ).exists()
    if has_shift:
        return True, 'night_shift'
    return False, None


def open_pharmacies_queryset(*, only_night: bool = False, now=None):
    """Pharmacy queryset annotated with `has_active_night_shift` and
    filtered to those currently open.

    `only_night=True` restricts to pharmacies whose night shift is active right
    now (regardless of whether they'd also be in regular hours).
    """
    now, current_time = _now_and_local_time(now)

    active_shift = NightShift.objects.filter(
        pharmacy=OuterRef('pk'),
        starts_at__lte=now,
        ends_at__gte=now,
    )

    qs = (
        Pharmacy.objects
        .filter(is_active=True, is_verified=True)
        .annotate(has_active_night_shift=Exists(active_shift))
    )

    if only_night:
        return qs.filter(has_active_night_shift=True)

    in_regular_hours = Q(opens_at__lte=current_time, closes_at__gte=current_time)
    return qs.filter(in_regular_hours | Q(has_active_night_shift=True))

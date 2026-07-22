from django.contrib.gis.db.models.functions import Distance
from django.contrib.gis.geos import Point
from django.contrib.gis.measure import D
from django.contrib.postgres.search import TrigramSimilarity
from django.db.models import Exists, OuterRef, Q
from django.utils import timezone

from apps.pharmacies.models import NightShift, PharmacyStock

from .eta import estimate_eta_minutes


def search_medicines_near(
    *,
    query: str,
    latitude: float,
    longitude: float,
    radius_m: int = 5000,
    similarity_threshold: float = 0.2,
    limit: int = 50,
    open_now: bool = False,
    night_only: bool = False,
):
    """Medicine-centric search. Pharmacy identity is intentionally hidden —
    customers don't pick a pharmacy; the order service routes them later.

    Returns: list of dicts, one per medicine, with min price, nearest distance,
    ETA estimate, count of pharmacies stocking it, and whether any of those
    pharmacies are currently on night duty.
    """
    point = Point(longitude, latitude, srid=4326)
    now = timezone.now()
    current_time = timezone.localtime(now).time()

    active_shift = NightShift.objects.filter(
        pharmacy=OuterRef('pharmacy'),
        starts_at__lte=now,
        ends_at__gte=now,
    )

    stocks = (
        PharmacyStock.objects
        .select_related('medicine')
        .filter(
            is_available=True,
            quantity__gt=0,
            pharmacy__is_active=True,
            pharmacy__is_verified=True,
            pharmacy__location__distance_lte=(point, D(m=radius_m)),
        )
        .annotate(
            name_sim=TrigramSimilarity('medicine__name', query),
            generic_sim=TrigramSimilarity('medicine__generic_name', query),
            distance=Distance('pharmacy__location', point),
            has_active_night_shift=Exists(active_shift),
        )
        .filter(Q(name_sim__gt=similarity_threshold) | Q(generic_sim__gt=similarity_threshold))
    )

    if night_only:
        stocks = stocks.filter(has_active_night_shift=True)
    elif open_now:
        in_regular_hours = Q(
            pharmacy__opens_at__lte=current_time,
            pharmacy__closes_at__gte=current_time,
        )
        stocks = stocks.filter(in_regular_hours | Q(has_active_night_shift=True))

    # Reasonable upper bound on rows scanned before grouping in Python.
    stocks = stocks.order_by('distance')[:limit * 10]

    grouped: dict[int, dict] = {}
    for stock in stocks:
        mid = stock.medicine_id
        distance_m = round(stock.distance.m)
        if mid not in grouped:
            grouped[mid] = {
                'medicine_id': mid,
                'medicine_name': stock.medicine.name,
                'generic_name': stock.medicine.generic_name,
                'requires_prescription': stock.medicine.requires_prescription,
                'min_price': stock.price,
                'nearest_distance_m': distance_m,
                'eta_minutes': estimate_eta_minutes(distance_m),
                'available_count': 1,
                'available_at_night_shift': bool(stock.has_active_night_shift),
            }
        else:
            entry = grouped[mid]
            entry['available_count'] += 1
            if stock.price < entry['min_price']:
                entry['min_price'] = stock.price
            if distance_m < entry['nearest_distance_m']:
                entry['nearest_distance_m'] = distance_m
                entry['eta_minutes'] = estimate_eta_minutes(distance_m)
            if stock.has_active_night_shift:
                entry['available_at_night_shift'] = True

    # Decimal → str for JSON safety, sort by distance.
    results = sorted(grouped.values(), key=lambda r: r['nearest_distance_m'])[:limit]
    for r in results:
        r['min_price'] = str(r['min_price'])
    return results

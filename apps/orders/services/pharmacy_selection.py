from django.contrib.gis.db.models.functions import Distance
from django.contrib.gis.measure import D

from apps.pharmacies.models import Pharmacy, PharmacyStock


def select_pharmacy_for_order(items, delivery_location, max_distance_m: int = 10_000):
    """Find the nearest pharmacy that:
    - is active + verified + open now (regular hours OR active night shift),
    - stocks every item with sufficient available quantity,
    - lies within `max_distance_m` of `delivery_location`.

    Returns a `Pharmacy` or `None`.
    """
    if not items:
        return None
    required_qty = {item['medicine']: item['quantity'] for item in items}
    medicine_ids = list(required_qty.keys())

    candidates = (
        Pharmacy.objects
        .filter(is_active=True, is_verified=True)
        .filter(location__distance_lte=(delivery_location, D(m=max_distance_m)))
        .open_now()
        .annotate(distance=Distance('location', delivery_location))
        .order_by('distance')
    )

    for pharmacy in candidates:
        stocks = PharmacyStock.objects.filter(
            pharmacy=pharmacy,
            medicine_id__in=medicine_ids,
            is_available=True,
        ).values_list('medicine_id', 'quantity')
        stock_map = dict(stocks)
        if all(stock_map.get(mid, 0) >= qty for mid, qty in required_qty.items()):
            return pharmacy
    return None

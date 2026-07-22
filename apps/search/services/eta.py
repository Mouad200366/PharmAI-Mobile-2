from math import ceil

# Tunables: simple linear model. Pickup prep time + per-meter ride time.
PREP_MINUTES = 5
METERS_PER_MINUTE = 415  # ~25 km/h average urban delivery (bike/scooter with stops)


def estimate_eta_minutes(distance_m: float | int) -> int:
    """Rough ETA from pharmacy to delivery address (minutes).

    Linear model — replace with a routing service (Mapbox Directions,
    Google Distance Matrix) when traffic-aware estimates matter.
    """
    if distance_m is None or distance_m < 0:
        return PREP_MINUTES
    return PREP_MINUTES + ceil(distance_m / METERS_PER_MINUTE)

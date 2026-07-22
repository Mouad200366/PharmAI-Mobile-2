"""Pure-Python unit tests for the ETA helper. No DB required."""
from apps.search.services.eta import (
    METERS_PER_MINUTE,
    PREP_MINUTES,
    estimate_eta_minutes,
)


def test_zero_distance_returns_just_prep_time():
    assert estimate_eta_minutes(0) == PREP_MINUTES


def test_eta_is_prep_plus_distance_over_speed():
    distance = METERS_PER_MINUTE * 4  # exactly 4 minutes of travel
    assert estimate_eta_minutes(distance) == PREP_MINUTES + 4


def test_eta_rounds_up_partial_minutes():
    """5 + ceil(415*1.5 / 415) = 5 + 2 = 7. Verifies we don't truncate."""
    assert estimate_eta_minutes(int(METERS_PER_MINUTE * 1.5)) == PREP_MINUTES + 2


def test_eta_handles_negative_or_none_safely():
    assert estimate_eta_minutes(None) == PREP_MINUTES
    assert estimate_eta_minutes(-100) == PREP_MINUTES


def test_eta_grows_monotonically_with_distance():
    distances = [0, 500, 2000, 5000, 10_000]
    etas = [estimate_eta_minutes(d) for d in distances]
    assert etas == sorted(etas)

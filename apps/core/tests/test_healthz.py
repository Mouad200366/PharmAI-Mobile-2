import pytest


@pytest.mark.django_db
def test_healthz_returns_200_when_db_is_up(api_client):
    res = api_client.get('/healthz/')
    assert res.status_code == 200
    assert res.json() == {'ok': True}


def test_healthz_does_not_require_auth(api_client):
    """Health probes are called by infra (k8s, LB) without credentials."""
    res = api_client.get('/healthz/')
    # Either 200 (DB up — db fixture not used here, no DB needed for the route)
    # or 503 (DB unreachable). Either way it's NOT 401/403.
    assert res.status_code in (200, 503)

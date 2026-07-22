from decimal import Decimal

import pytest
from rest_framework import status

pytestmark = pytest.mark.django_db


def test_create_address(auth_client):
    resp = auth_client.post(
        '/api/v1/addresses/',
        {
            'label': 'home',
            'street': '12 Rue Mohamed V',
            'city': 'Casablanca',
            'postal_code': '20000',
            'latitude': '33.573100',
            'longitude': '-7.589800',
            'is_default': True,
        },
        format='json',
    )
    assert resp.status_code == status.HTTP_201_CREATED
    assert Decimal(resp.data['latitude']) == Decimal('33.573100')
    assert Decimal(resp.data['longitude']) == Decimal('-7.589800')


def test_list_addresses_only_returns_owner(auth_client):
    auth_client.post('/api/v1/addresses/', {
        'label': 'home', 'street': 'X', 'city': 'Casa',
        'latitude': '33.5', 'longitude': '-7.5',
    }, format='json')
    resp = auth_client.get('/api/v1/addresses/')
    assert resp.status_code == status.HTTP_200_OK
    assert resp.data['count'] == 1


def test_unauthenticated_request_rejected(api_client):
    resp = api_client.get('/api/v1/addresses/')
    assert resp.status_code == status.HTTP_401_UNAUTHORIZED


def test_missing_coordinates_rejected(auth_client):
    resp = auth_client.post('/api/v1/addresses/', {
        'label': 'home', 'street': 'X', 'city': 'Casa',
    }, format='json')
    assert resp.status_code == status.HTTP_400_BAD_REQUEST

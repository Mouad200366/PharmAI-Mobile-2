import pytest

from apps.addresses.serializers import AddressSerializer


def payload(**overrides):
    data = {
        'label': 'Domicile',
        'street': '12 Rue Ibn Sina',
        'city': 'Casablanca',
        'postal_code': '20250',
        'latitude': '33.573100',
        'longitude': '-7.589800',
        'is_default': False,
    }
    data.update(overrides)
    return data


@pytest.mark.parametrize(
    ('field', 'value'),
    (
        ('latitude', '90.000001'),
        ('latitude', '-90.000001'),
        ('longitude', '180.000001'),
        ('longitude', '-180.000001'),
    ),
)
def test_address_rejects_out_of_range_coordinates(field, value):
    serializer = AddressSerializer(
        data=payload(**{field: value}),
    )

    assert serializer.is_valid() is False
    assert field in serializer.errors


def test_address_rejects_zero_zero_placeholder():
    serializer = AddressSerializer(
        data=payload(
            latitude='0.000000',
            longitude='0.000000',
        ),
    )

    assert serializer.is_valid() is False
    assert 'latitude' in serializer.errors
    assert 'longitude' in serializer.errors


@pytest.mark.parametrize(
    ('latitude', 'longitude'),
    (
        ('90.000000', '180.000000'),
        ('-90.000000', '-180.000000'),
        ('33.573100', '-7.589800'),
    ),
)
def test_address_accepts_valid_coordinate_bounds(
    latitude,
    longitude,
):
    serializer = AddressSerializer(
        data=payload(
            latitude=latitude,
            longitude=longitude,
        ),
    )

    assert serializer.is_valid(), serializer.errors

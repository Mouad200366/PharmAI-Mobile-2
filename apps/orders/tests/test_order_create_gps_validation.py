import pytest

from apps.orders.serializers import OrderCreateSerializer


def payload(**overrides):
    data = {
        'items': [
            {
                'medicine': 1,
                'quantity': 1,
            },
        ],
        'delivery_address': '12 Rue Ibn Sina, Casablanca',
        'latitude': 33.5731,
        'longitude': -7.5898,
        'prescription_mode': 'none',
        'payment_method': 'cash',
    }
    data.update(overrides)
    return data


def test_order_create_rejects_zero_zero_delivery_position():
    serializer = OrderCreateSerializer(
        data=payload(
            latitude=0.0,
            longitude=0.0,
        ),
    )

    assert serializer.is_valid() is False
    assert 'latitude' in serializer.errors
    assert 'longitude' in serializer.errors


@pytest.mark.parametrize(
    ('latitude', 'longitude'),
    (
        (0.000002, 0.000002),
        (33.5731, -7.5898),
        (-33.9, 18.4),
    ),
)
def test_order_create_accepts_non_placeholder_coordinates(
    latitude,
    longitude,
):
    serializer = OrderCreateSerializer(
        data=payload(
            latitude=latitude,
            longitude=longitude,
        ),
    )

    assert serializer.is_valid(), serializer.errors

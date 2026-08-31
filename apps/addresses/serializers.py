from decimal import Decimal

from rest_framework import serializers

from .models import Address


class AddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = Address
        fields = (
            'id', 'label', 'street', 'city', 'postal_code',
            'latitude', 'longitude', 'is_default',
            'created_at', 'updated_at',
        )
        read_only_fields = ('id', 'created_at', 'updated_at')

    def validate_latitude(self, value):
        if value < Decimal('-90') or value > Decimal('90'):
            raise serializers.ValidationError(
                'Latitude must be between -90 and 90 degrees.',
            )
        return value

    def validate_longitude(self, value):
        if value < Decimal('-180') or value > Decimal('180'):
            raise serializers.ValidationError(
                'Longitude must be between -180 and 180 degrees.',
            )
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)

        latitude = attrs.get(
            'latitude',
            getattr(self.instance, 'latitude', None),
        )
        longitude = attrs.get(
            'longitude',
            getattr(self.instance, 'longitude', None),
        )

        if (
            latitude is not None
            and longitude is not None
            and abs(latitude) < Decimal('0.000001')
            and abs(longitude) < Decimal('0.000001')
        ):
            raise serializers.ValidationError(
                {
                    'latitude': (
                        'A real delivery GPS position is required; '
                        '0,0 is not accepted.'
                    ),
                    'longitude': (
                        'A real delivery GPS position is required; '
                        '0,0 is not accepted.'
                    ),
                },
            )

        return attrs

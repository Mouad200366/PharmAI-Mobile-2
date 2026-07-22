from django.contrib.gis.geos import Point
from rest_framework import serializers

from .models import DeliveryAgentProfile


class DeliveryAgentProfileSerializer(serializers.ModelSerializer):
    latitude = serializers.SerializerMethodField()
    longitude = serializers.SerializerMethodField()

    class Meta:
        model = DeliveryAgentProfile
        fields = ('id', 'is_online', 'latitude', 'longitude', 'location_updated_at')
        read_only_fields = fields

    def get_latitude(self, obj):
        return obj.current_location.y if obj.current_location else None

    def get_longitude(self, obj):
        return obj.current_location.x if obj.current_location else None


class OnlineToggleSerializer(serializers.Serializer):
    is_online = serializers.BooleanField()
    latitude = serializers.FloatField(min_value=-90, max_value=90, required=False)
    longitude = serializers.FloatField(min_value=-180, max_value=180, required=False)

    def validate(self, attrs):
        if attrs.get('is_online'):
            if 'latitude' not in attrs or 'longitude' not in attrs:
                raise serializers.ValidationError(
                    'latitude and longitude are required when going online.',
                )
        return attrs


class LocationUpdateSerializer(serializers.Serializer):
    latitude = serializers.FloatField(min_value=-90, max_value=90)
    longitude = serializers.FloatField(min_value=-180, max_value=180)


def point_from(lat: float, lng: float) -> Point:
    return Point(lng, lat, srid=4326)

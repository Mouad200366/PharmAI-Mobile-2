from django.contrib.gis.geos import Point
from django.utils import timezone
from rest_framework import serializers

from .models import (
    DeliveryAgentProfile,
    DeliveryApplication,
    DeliveryOffer,
)


class DeliveryAgentProfileSerializer(serializers.ModelSerializer):
    latitude = serializers.SerializerMethodField()
    longitude = serializers.SerializerMethodField()
    can_work = serializers.BooleanField(read_only=True)

    class Meta:
        model = DeliveryAgentProfile
        fields = (
            'id',
            'work_status',
            'can_work',
            'is_online',
            'latitude',
            'longitude',
            'location_updated_at',
            'approved_at',
            'suspended_at',
            'suspension_reason',
        )
        read_only_fields = fields

    def get_latitude(self, obj):
        return obj.current_location.y if obj.current_location else None

    def get_longitude(self, obj):
        return obj.current_location.x if obj.current_location else None


class DeliveryApplicationSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(read_only=True)
    full_name = serializers.CharField(
        source='user.full_name',
        read_only=True,
    )
    phone = serializers.CharField(
        source='user.phone',
        read_only=True,
    )
    email = serializers.EmailField(
        source='user.email',
        read_only=True,
    )
    cin = serializers.CharField(
        source='user.cin',
        read_only=True,
    )
    reviewed_by_name = serializers.CharField(
        source='reviewed_by.full_name',
        read_only=True,
        allow_null=True,
    )

    class Meta:
        model = DeliveryApplication
        fields = (
            'id',
            'user_id',
            'full_name',
            'phone',
            'email',
            'cin',
            'status',
            'submitted_at',
            'reviewed_at',
            'reviewed_by_name',
            'review_note',
        )
        read_only_fields = fields


class DeliveryApplicationReviewSerializer(serializers.Serializer):
    review_note = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=2000,
    )


class DeliveryOfferSerializer(serializers.ModelSerializer):
    order_id = serializers.IntegerField(read_only=True)
    pharmacy_name = serializers.CharField(
        source='order.pharmacy.name',
        read_only=True,
    )
    pharmacy_address = serializers.CharField(
        source='order.pharmacy.address',
        read_only=True,
    )
    pharmacy_latitude = serializers.SerializerMethodField()
    pharmacy_longitude = serializers.SerializerMethodField()
    payment_method = serializers.CharField(
        source='order.payment_method',
        read_only=True,
    )
    package_count = serializers.SerializerMethodField()
    seconds_remaining = serializers.SerializerMethodField()

    class Meta:
        model = DeliveryOffer
        fields = (
            'id',
            'order_id',
            'status',
            'expires_at',
            'seconds_remaining',
            'earning_amount',
            'pharmacy_name',
            'pharmacy_address',
            'pharmacy_latitude',
            'pharmacy_longitude',
            'payment_method',
            'package_count',
        )
        read_only_fields = fields

    def get_pharmacy_latitude(self, obj):
        pharmacy = obj.order.pharmacy
        return pharmacy.location.y if pharmacy and pharmacy.location else None

    def get_pharmacy_longitude(self, obj):
        pharmacy = obj.order.pharmacy
        return pharmacy.location.x if pharmacy and pharmacy.location else None

    def get_package_count(self, obj):
        return sum(item.quantity for item in obj.order.items.all())

    def get_seconds_remaining(self, obj):
        remaining = (obj.expires_at - timezone.now()).total_seconds()
        return max(0, int(remaining))


class OnlineToggleSerializer(serializers.Serializer):
    is_online = serializers.BooleanField()
    latitude = serializers.FloatField(
        min_value=-90,
        max_value=90,
        required=False,
    )
    longitude = serializers.FloatField(
        min_value=-180,
        max_value=180,
        required=False,
    )

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
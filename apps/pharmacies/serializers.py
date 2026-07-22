from django.contrib.gis.geos import Point
from rest_framework import serializers

from .models import NightShift, Pharmacy, PharmacyStock


class PharmacySerializer(serializers.ModelSerializer):
    latitude = serializers.FloatField(min_value=-90, max_value=90, write_only=True)
    longitude = serializers.FloatField(min_value=-180, max_value=180, write_only=True)
    location = serializers.SerializerMethodField()

    class Meta:
        model = Pharmacy
        fields = (
            'id', 'name', 'license_number', 'phone', 'address',
            'latitude', 'longitude', 'location',
            'opens_at', 'closes_at',
            'is_active', 'is_verified',
            'created_at', 'updated_at',
        )
        read_only_fields = ('id', 'is_verified', 'created_at', 'updated_at')

    def get_location(self, obj):
        if obj.location is None:
            return None
        return {'latitude': obj.location.y, 'longitude': obj.location.x}

    def _pop_point(self, attrs, *, required):
        lat = attrs.pop('latitude', None)
        lng = attrs.pop('longitude', None)
        if lat is None and lng is None:
            if required:
                raise serializers.ValidationError(
                    {'latitude': 'latitude and longitude are required.'},
                )
            return None
        if lat is None or lng is None:
            raise serializers.ValidationError(
                {'latitude': 'latitude and longitude must be provided together.'},
            )
        return Point(lng, lat, srid=4326)

    def create(self, validated_data):
        validated_data['location'] = self._pop_point(validated_data, required=True)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        point = self._pop_point(validated_data, required=False)
        if point is not None:
            validated_data['location'] = point
        return super().update(instance, validated_data)


class PharmacyStockSerializer(serializers.ModelSerializer):
    medicine_name = serializers.CharField(source='medicine.name', read_only=True)
    requires_prescription = serializers.BooleanField(
        source='medicine.requires_prescription', read_only=True,
    )

    class Meta:
        model = PharmacyStock
        fields = (
            'id', 'medicine', 'medicine_name', 'requires_prescription',
            'price', 'quantity', 'is_available',
            'created_at', 'updated_at',
        )
        read_only_fields = ('id', 'created_at', 'updated_at')


class NightShiftSerializer(serializers.ModelSerializer):
    pharmacy_name = serializers.CharField(source='pharmacy.name', read_only=True)

    class Meta:
        model = NightShift
        fields = (
            'id', 'pharmacy', 'pharmacy_name', 'starts_at', 'ends_at', 'notes',
            'created_by', 'created_at', 'updated_at',
        )
        read_only_fields = ('id', 'created_by', 'created_at', 'updated_at')

    def validate(self, attrs):
        starts = attrs.get('starts_at') or getattr(self.instance, 'starts_at', None)
        ends = attrs.get('ends_at') or getattr(self.instance, 'ends_at', None)
        if starts and ends and ends <= starts:
            raise serializers.ValidationError(
                {'ends_at': 'ends_at must be after starts_at.'},
            )
        pharmacy = attrs.get('pharmacy') or getattr(self.instance, 'pharmacy', None)
        if pharmacy and starts and ends:
            overlapping = NightShift.objects.filter(
                pharmacy=pharmacy,
                starts_at__lt=ends,
                ends_at__gt=starts,
            )
            if self.instance is not None:
                overlapping = overlapping.exclude(pk=self.instance.pk)
            if overlapping.exists():
                raise serializers.ValidationError(
                    {'starts_at': 'Overlaps an existing shift for this pharmacy.'},
                )
        return attrs


class OpenPharmacySerializer(serializers.ModelSerializer):
    """Read-only response shape for /api/pharmacies/open-now/."""

    latitude = serializers.SerializerMethodField()
    longitude = serializers.SerializerMethodField()
    is_night_shift = serializers.BooleanField(
        source='has_active_night_shift', read_only=True,
    )
    distance_m = serializers.SerializerMethodField()

    class Meta:
        model = Pharmacy
        fields = (
            'id', 'name', 'phone', 'address',
            'latitude', 'longitude', 'distance_m',
            'opens_at', 'closes_at',
            'is_night_shift',
        )

    def get_latitude(self, obj):
        return obj.location.y if obj.location else None

    def get_longitude(self, obj):
        return obj.location.x if obj.location else None

    def get_distance_m(self, obj):
        distance = getattr(obj, 'distance', None)
        return round(distance.m) if distance is not None else None

from rest_framework import serializers

from .models import DeliveryVerificationMethod


class PickupVerificationRequestSerializer(serializers.Serializer):
    method = serializers.ChoiceField(
        choices=DeliveryVerificationMethod.choices,
    )
    credential = serializers.CharField(
        allow_blank=False,
        trim_whitespace=True,
        max_length=255,
    )
    latitude = serializers.FloatField(
        min_value=-90,
        max_value=90,
    )
    longitude = serializers.FloatField(
        min_value=-180,
        max_value=180,
    )
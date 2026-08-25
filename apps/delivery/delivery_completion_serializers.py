from rest_framework import serializers


class DeliveryCompletionRequestSerializer(serializers.Serializer):
    pin = serializers.CharField(
        allow_blank=False,
        trim_whitespace=True,
        min_length=6,
        max_length=6,
    )
    latitude = serializers.FloatField(
        min_value=-90,
        max_value=90,
    )
    longitude = serializers.FloatField(
        min_value=-180,
        max_value=180,
    )
    cash_confirmed = serializers.BooleanField(
        required=False,
        default=False,
    )

    def validate_pin(self, value):
        if not value.isdigit():
            raise serializers.ValidationError(
                'Delivery PIN must contain exactly 6 digits.',
            )
        return value
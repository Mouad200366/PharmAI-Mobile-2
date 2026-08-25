from rest_framework import serializers

from apps.delivery.models import (
    DeliveryIncident,
    DeliveryIncidentReason,
    DeliveryIncidentStatus,
    DeliveryVerificationMethod,
)


class DeliveryIncidentSerializer(serializers.ModelSerializer):
    order_id = serializers.IntegerField(
        read_only=True,
    )
    agent_id = serializers.IntegerField(
        read_only=True,
    )

    class Meta:
        model = DeliveryIncident
        fields = (
            "id",
            "order_id",
            "agent_id",
            "reason",
            "status",
            "reported_order_status",
            "details",
            "resolution_note",
            "resolved_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class DeliveryIncidentReportSerializer(serializers.Serializer):
    reason = serializers.ChoiceField(
        choices=DeliveryIncidentReason.choices,
    )
    details = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=2000,
    )


class DeliveryIncidentResolutionSerializer(serializers.Serializer):
    resolution_note = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=2000,
    )


class DeliveryReturnVerificationSerializer(serializers.Serializer):
    credential = serializers.CharField(
        min_length=1,
        max_length=512,
    )
    method = serializers.ChoiceField(
        choices=(
            DeliveryVerificationMethod.PIN,
            DeliveryVerificationMethod.QR,
        ),
    )
    latitude = serializers.FloatField(
        min_value=-90,
        max_value=90,
    )
    longitude = serializers.FloatField(
        min_value=-180,
        max_value=180,
    )
from rest_framework import serializers

from apps.delivery.models import (
    CashSettlement,
    DeliveryEarning,
)


class DeliveryEarningHistorySerializer(serializers.ModelSerializer):
    order_id = serializers.IntegerField(
        read_only=True,
    )

    class Meta:
        model = DeliveryEarning
        fields = (
            "id",
            "order_id",
            "amount",
            "currency",
            "status",
            "earned_at",
            "paid_at",
            "created_at",
        )
        read_only_fields = fields


class CashSettlementHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = CashSettlement
        fields = (
            "id",
            "amount",
            "currency",
            "status",
            "completed_at",
            "note",
            "created_at",
        )
        read_only_fields = fields
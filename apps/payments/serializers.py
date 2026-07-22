from rest_framework import serializers

from .models import Payment


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = (
            'id', 'order', 'provider', 'provider_payment_id',
            'amount', 'currency', 'status', 'paid_at',
            'created_at', 'updated_at',
        )
        read_only_fields = fields


class PaymentIntentRequestSerializer(serializers.Serializer):
    order_id = serializers.IntegerField(min_value=1)


class PaymentIntentResponseSerializer(serializers.Serializer):
    client_secret = serializers.CharField()
    payment_intent_id = serializers.CharField()
    amount = serializers.DecimalField(max_digits=10, decimal_places=2)
    currency = serializers.CharField()

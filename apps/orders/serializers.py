from rest_framework import serializers

from apps.delivery.models import (
    DeliveryIncident,
    DeliveryIncidentStatus,
)

from .constants import PaymentMethod, PrescriptionMode
from .models import (
    ChatMessage,
    Order,
    OrderItem,
    OrderStatusHistory,
    Prescription,
)


class OrderItemInputSerializer(serializers.Serializer):
    medicine = serializers.IntegerField(min_value=1)
    quantity = serializers.IntegerField(min_value=1)


class OrderCreateSerializer(serializers.Serializer):
    items = OrderItemInputSerializer(many=True, min_length=1)
    delivery_address = serializers.CharField(max_length=500)
    latitude = serializers.FloatField(min_value=-90, max_value=90)
    longitude = serializers.FloatField(min_value=-180, max_value=180)
    prescription_mode = serializers.ChoiceField(
        choices=PrescriptionMode.choices, default=PrescriptionMode.NONE,
    )
    payment_method = serializers.ChoiceField(
        choices=PaymentMethod.choices, default=PaymentMethod.CASH,
    )
    prescription_photo = serializers.ImageField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=1000)

    def validate(self, attrs):
        attrs = super().validate(attrs)

        latitude = attrs.get('latitude')
        longitude = attrs.get('longitude')

        if (
            latitude is not None
            and longitude is not None
            and abs(latitude) < 0.000001
            and abs(longitude) < 0.000001
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


class OrderItemReadSerializer(serializers.ModelSerializer):
    medicine_name = serializers.CharField(source='medicine.name', read_only=True)
    line_total = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = OrderItem
        fields = ('id', 'medicine', 'medicine_name', 'quantity', 'unit_price', 'line_total')


class PrescriptionReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = Prescription
        fields = (
            'id', 'photo', 'status', 'rejection_reason', 'verified_at',
        )


class OrderStatusHistoryReadSerializer(serializers.ModelSerializer):
    """Safe, read-only timeline data exposed to the patient application."""

    class Meta:
        model = OrderStatusHistory
        fields = ('id', 'status', 'created_at')
        read_only_fields = fields


CUSTOMER_VISIBLE_INCIDENT_STATUSES = (
    DeliveryIncidentStatus.OPEN,
    DeliveryIncidentStatus.RETURN_REQUIRED,
    DeliveryIncidentStatus.RETURNING,
    DeliveryIncidentStatus.RETURNED,
)


class CustomerDeliveryIncidentSerializer(serializers.ModelSerializer):
    """Minimal delivery-incident state safe for the patient application.

    Courier identity, raw reason, free-text details, and supervisor resolution
    notes remain private operational data and are intentionally not exposed.
    """

    class Meta:
        model = DeliveryIncident
        fields = ('id', 'status', 'created_at', 'updated_at')
        read_only_fields = fields


class _BaseOrderSerializer(serializers.ModelSerializer):
    items = OrderItemReadSerializer(many=True, read_only=True)
    prescription = PrescriptionReadSerializer(read_only=True)
    delivery_latitude = serializers.SerializerMethodField()
    delivery_longitude = serializers.SerializerMethodField()

    def get_delivery_latitude(self, obj):
        return obj.delivery_location.y if obj.delivery_location else None

    def get_delivery_longitude(self, obj):
        return obj.delivery_location.x if obj.delivery_location else None


class CustomerOrderSerializer(_BaseOrderSerializer):
    """Customer view — pharmacy identity stripped."""

    status_history = OrderStatusHistoryReadSerializer(many=True, read_only=True)
    delivery_incident = serializers.SerializerMethodField()
    delivery_agent_name = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = (
            'id', 'status', 'prescription_mode', 'payment_method',
            'delivery_address', 'delivery_latitude', 'delivery_longitude',
            'items', 'prescription', 'status_history', 'delivery_incident',
            'delivery_agent_name',
            'items_total', 'delivery_fee', 'grand_total',
            'notes', 'created_at', 'updated_at',
        )
        read_only_fields = fields

    def get_delivery_agent_name(self, obj):
        # Patient-safe identity: only the assigned courier display name.
        # Preserve Step 2 privacy while an unresolved incident/return is active.
        has_active_incident = any(
            incident.status in CUSTOMER_VISIBLE_INCIDENT_STATUSES
            for incident in obj.delivery_incidents.all()
        )
        if has_active_incident or obj.delivery_agent is None:
            return None
        return obj.delivery_agent.full_name

    def get_delivery_incident(self, obj):
        incident = next(
            (
                incident
                for incident in obj.delivery_incidents.all()
                if incident.status in CUSTOMER_VISIBLE_INCIDENT_STATUSES
            ),
            None,
        )
        if incident is None:
            return None
        return CustomerDeliveryIncidentSerializer(incident).data


class PharmacyOrderSerializer(_BaseOrderSerializer):
    """Pharmacy view — full info."""

    customer_name = serializers.CharField(source='customer.full_name', read_only=True)
    customer_phone = serializers.CharField(source='customer.phone', read_only=True)
    delivery_agent_name = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = (
            'id', 'status', 'prescription_mode', 'payment_method',
            'customer', 'customer_name', 'customer_phone',
            'delivery_address', 'delivery_latitude', 'delivery_longitude',
            'delivery_agent', 'delivery_agent_name',
            'items', 'prescription',
            'items_total', 'delivery_fee', 'grand_total',
            'notes', 'created_at', 'updated_at',
        )
        read_only_fields = fields

    def get_delivery_agent_name(self, obj):
        return obj.delivery_agent.full_name if obj.delivery_agent else None


class AgentOrderSerializer(_BaseOrderSerializer):
    """Delivery-agent view — needs both pharmacy address and customer address."""

    pharmacy_name = serializers.CharField(source='pharmacy.name', read_only=True)
    pharmacy_address = serializers.CharField(source='pharmacy.address', read_only=True)
    pharmacy_phone = serializers.CharField(source='pharmacy.phone', read_only=True)
    pharmacy_latitude = serializers.SerializerMethodField()
    pharmacy_longitude = serializers.SerializerMethodField()
    customer_phone = serializers.CharField(source='customer.phone', read_only=True)

    class Meta:
        model = Order
        fields = (
            'id', 'status', 'prescription_mode', 'payment_method',
            'pharmacy', 'pharmacy_name', 'pharmacy_address', 'pharmacy_phone',
            'pharmacy_latitude', 'pharmacy_longitude',
            'customer_phone',
            'delivery_address', 'delivery_latitude', 'delivery_longitude',
            'items', 'items_total', 'delivery_fee', 'grand_total',
            'notes', 'created_at', 'updated_at',
        )
        read_only_fields = fields

    def get_pharmacy_latitude(self, obj):
        return obj.pharmacy.location.y if obj.pharmacy and obj.pharmacy.location else None

    def get_pharmacy_longitude(self, obj):
        return obj.pharmacy.location.x if obj.pharmacy and obj.pharmacy.location else None


class AdminOrderSerializer(_BaseOrderSerializer):
    """Admin view — everything."""

    class Meta:
        model = Order
        fields = '__all__'


class StatusTransitionSerializer(serializers.Serializer):
    status = serializers.CharField()


class PrescriptionVerifySerializer(serializers.Serializer):
    approve = serializers.BooleanField()
    rejection_reason = serializers.CharField(required=False, allow_blank=True, max_length=500)


class ChatMessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.CharField(source='sender.full_name', read_only=True)

    class Meta:
        model = ChatMessage
        fields = ('id', 'order', 'sender', 'sender_name', 'content', 'read_at', 'created_at')
        read_only_fields = fields
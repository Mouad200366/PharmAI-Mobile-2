from rest_framework import serializers

from .models import Medicine


class MedicineSerializer(serializers.ModelSerializer):
    min_price = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        read_only=True,
        allow_null=True,
    )

    available_pharmacies_count = serializers.IntegerField(
        read_only=True,
    )

    total_available_quantity = serializers.IntegerField(
        read_only=True,
    )

    is_available = serializers.SerializerMethodField()
    currency = serializers.SerializerMethodField()

    class Meta:
        model = Medicine

        fields = (
            'id',
            'name',
            'generic_name',
            'description',
            'manufacturer',
            'requires_prescription',
            'image',
            'is_active',
            'min_price',
            'currency',
            'is_available',
            'available_pharmacies_count',
            'total_available_quantity',
            'created_at',
            'updated_at',
        )

        read_only_fields = (
            'id',
            'created_at',
            'updated_at',
            'min_price',
            'currency',
            'is_available',
            'available_pharmacies_count',
            'total_available_quantity',
        )

    def get_is_available(self, obj):
        return (
            getattr(
                obj,
                'available_pharmacies_count',
                0,
            )
            > 0
        )

    def get_currency(self, obj):
        return 'MAD'
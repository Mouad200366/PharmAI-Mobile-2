from rest_framework import serializers

from .models import Medicine


class MedicineSerializer(serializers.ModelSerializer):
    class Meta:
        model = Medicine
        fields = (
            'id', 'name', 'generic_name', 'description', 'manufacturer',
            'requires_prescription', 'image', 'is_active',
            'created_at', 'updated_at',
        )
        read_only_fields = ('id', 'created_at', 'updated_at')

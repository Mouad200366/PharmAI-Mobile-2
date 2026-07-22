from rest_framework import serializers


class MedicineSearchQuerySerializer(serializers.Serializer):
    q = serializers.CharField(min_length=2, max_length=100)
    lat = serializers.FloatField(min_value=-90, max_value=90)
    lng = serializers.FloatField(min_value=-180, max_value=180)
    radius = serializers.IntegerField(
        min_value=100, max_value=50_000, default=5000, required=False,
    )
    limit = serializers.IntegerField(
        min_value=1, max_value=200, default=50, required=False,
    )
    open_now = serializers.BooleanField(default=False, required=False)
    night_only = serializers.BooleanField(default=False, required=False)

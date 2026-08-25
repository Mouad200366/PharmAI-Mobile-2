from rest_framework import serializers

from .models import (
    DevicePlatform,
    Notification,
    UserDevice,
)


class NotificationSerializer(serializers.ModelSerializer):
    is_read = serializers.BooleanField(read_only=True)

    class Meta:
        model = Notification
        fields = ('id', 'type', 'title', 'body', 'payload', 'read_at', 'is_read', 'created_at')
        read_only_fields = fields


class UserDeviceSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(read_only=True)

    class Meta:
        model = UserDevice
        fields = (
            'id',
            'user_id',
            'device_id',
            'platform',
            'push_token',
            'app_version',
            'is_active',
            'is_primary',
            'last_seen_at',
            'created_at',
            'updated_at',
        )
        read_only_fields = fields


class UserDeviceRegistrationSerializer(serializers.Serializer):
    device_id = serializers.CharField(
        max_length=128,
        trim_whitespace=True,
    )
    platform = serializers.ChoiceField(
        choices=DevicePlatform.choices,
    )
    push_token = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        max_length=255,
        trim_whitespace=True,
    )
    app_version = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=32,
        trim_whitespace=True,
    )
    is_primary = serializers.BooleanField(
        required=False,
        default=True,
    )


class UserDeviceDeactivationSerializer(serializers.Serializer):
    device_id = serializers.CharField(
        max_length=128,
        trim_whitespace=True,
    )


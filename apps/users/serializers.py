from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

User = get_user_model()

MAX_AVATAR_SIZE = 5 * 1024 * 1024


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    avatar = serializers.ImageField(
        required=False,
        allow_null=True,
    )

    class Meta:
        model = User
        fields = (
            'id',
            'phone',
            'email',
            'cin',
            'first_name',
            'last_name',
            'full_name',
            'date_of_birth',
            'gender',
            'avatar',
            'role',
            'is_phone_verified',
            'date_joined',
        )
        read_only_fields = (
            'id',
            'phone',
            'cin',
            'role',
            'is_phone_verified',
            'date_joined',
        )

    def validate_avatar(self, value):
        if value is None:
            return value

        if value.size > MAX_AVATAR_SIZE:
            raise serializers.ValidationError(
                'Profile photo must be 5 MB or smaller.',
            )

        return value


class PasswordChangeSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(
        write_only=True,
        validators=[validate_password],
    )

    def validate_old_password(self, value):
        user = self.context['request'].user

        if not user.check_password(value):
            raise serializers.ValidationError(
                'Old password incorrect.',
            )

        return value

    def save(self, **kwargs):
        user = self.context['request'].user
        user.set_password(self.validated_data['new_password'])
        user.save(update_fields=['password'])
        return user


class PasswordResetSerializer(serializers.Serializer):
    """Used after OTP verification - no old password required."""

    new_password = serializers.CharField(
        write_only=True,
        validators=[validate_password],
    )
    new_password_confirm = serializers.CharField(write_only=True)

    def validate(self, attrs):
        if attrs['new_password'] != attrs['new_password_confirm']:
            raise serializers.ValidationError(
                {
                    'new_password_confirm': (
                        'Passwords do not match.'
                    ),
                },
            )

        return attrs

    def save(self, **kwargs):
        user = self.context['request'].user
        user.set_password(self.validated_data['new_password'])
        user.save(update_fields=['password'])
        return user
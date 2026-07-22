from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core.constants import OTPPurpose

from .services import request_otp, verify_otp

User = get_user_model()


def _tokens_for(user):
    refresh = RefreshToken.for_user(user)
    return {
        'access': str(refresh.access_token),
        'refresh': str(refresh),
        'user_id': user.id,
    }


class SignUpSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])
    password_confirm = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = (
            'phone', 'email', 'cin', 'first_name', 'last_name',
            'date_of_birth', 'gender', 'password', 'password_confirm',
        )

    def validate(self, attrs):
        if attrs['password'] != attrs.pop('password_confirm'):
            raise serializers.ValidationError(
                {'password_confirm': 'Passwords do not match.'}
            )
        return attrs

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.is_phone_verified = False
        user.set_password(password)
        user.save()
        request_otp(str(user.phone), purpose=OTPPurpose.SIGNUP)
        return user


class RequestOTPSerializer(serializers.Serializer):
    phone = serializers.CharField()
    purpose = serializers.ChoiceField(
        choices=OTPPurpose.choices, default=OTPPurpose.SIGNUP,
    )

    def validate_phone(self, value):
        if not User.objects.filter(phone=value).exists():
            raise serializers.ValidationError('No user with this phone.')
        return value

    def save(self, **kwargs):
        request_otp(self.validated_data['phone'], self.validated_data['purpose'])
        return {'detail': 'OTP sent.'}


class VerifyOTPSerializer(serializers.Serializer):
    phone = serializers.CharField()
    code = serializers.CharField(min_length=4, max_length=10)
    purpose = serializers.ChoiceField(
        choices=OTPPurpose.choices, default=OTPPurpose.SIGNUP,
    )

    def validate(self, attrs):
        ok, msg = verify_otp(attrs['phone'], attrs['code'], attrs['purpose'])
        if not ok:
            raise serializers.ValidationError({'code': msg})
        return attrs

    def save(self, **kwargs):
        try:
            user = User.objects.get(phone=self.validated_data['phone'])
        except User.DoesNotExist as exc:
            raise serializers.ValidationError({'phone': 'User not found.'}) from exc
        if not user.is_phone_verified:
            user.is_phone_verified = True
            user.save(update_fields=['is_phone_verified'])
        return _tokens_for(user)


class LoginSerializer(serializers.Serializer):
    phone = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        user = authenticate(
            request=self.context.get('request'),
            phone=attrs['phone'],
            password=attrs['password'],
        )
        if user is None:
            raise serializers.ValidationError('Invalid credentials.')
        if not user.is_active:
            raise serializers.ValidationError('Account is disabled.')
        if not user.is_phone_verified:
            raise serializers.ValidationError(
                'Phone not verified. Please verify via OTP.'
            )
        return _tokens_for(user)


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField()

    def validate_refresh(self, value):
        try:
            self._token = RefreshToken(value)
        except Exception as exc:
            raise serializers.ValidationError(
                'Invalid or expired refresh token.',
            ) from exc
        return value

    def save(self, **kwargs):
        self._token.blacklist()


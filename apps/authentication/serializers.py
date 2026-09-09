from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken

from django.contrib.gis.geos import Point
from django.db import transaction

from apps.core.constants import Gender, OTPPurpose, UserRole
from apps.pharmacies.models import Pharmacy

from apps.core.constants import OTPPurpose

from .services import request_otp, verify_otp

User = get_user_model()


def _tokens_for(user):
    refresh = RefreshToken.for_user(user)
    return {
        'access': str(refresh.access_token),
        'refresh': str(refresh),
        'user_id': user.id,
        'role': user.role,
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

class PharmacistSignUpSerializer(serializers.Serializer):
    firstName = serializers.CharField(max_length=80)
    lastName = serializers.CharField(max_length=80)
    email = serializers.EmailField()
    phone = serializers.CharField()
    cin = serializers.CharField(max_length=10, validators=[validate_cin])
    dateOfBirth = serializers.DateField()
    gender = serializers.ChoiceField(choices=Gender.choices)

    pharmacyName = serializers.CharField(max_length=200)
    licenseNumber = serializers.CharField(max_length=100)
    city = serializers.CharField(max_length=120)
    address = serializers.CharField(max_length=500)

    latitude = serializers.FloatField(min_value=-90, max_value=90)
    longitude = serializers.FloatField(min_value=-180, max_value=180)

    password = serializers.CharField(write_only=True)

    def validate_email(self, value):
        value = value.strip().lower()

        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError(
                'An account already uses this email.'
            )

        return value

    def validate_phone(self, value):
        if User.objects.filter(phone=value).exists():
            raise serializers.ValidationError(
                'An account already uses this phone number.'
            )

        return value

    def validate_cin(self, value):
        value = value.strip().upper()

        if User.objects.filter(cin=value).exists():
            raise serializers.ValidationError(
                'An account already uses this CIN.'
            )

        return value

    def validate_licenseNumber(self, value):
        value = value.strip()

        if Pharmacy.objects.filter(
            license_number__iexact=value
        ).exists():
            raise serializers.ValidationError(
                'This pharmacy license is already registered.'
            )

        return value

    def validate_password(self, value):
        validate_password(value)
        return value

    @transaction.atomic
    def create(self, validated_data):
        pharmacy_name = validated_data.pop('pharmacyName')
        license_number = validated_data.pop('licenseNumber')
        city = validated_data.pop('city')
        address = validated_data.pop('address')
        latitude = validated_data.pop('latitude')
        longitude = validated_data.pop('longitude')
        password = validated_data.pop('password')

        user = User(
            first_name=validated_data.pop('firstName'),
            last_name=validated_data.pop('lastName'),
            email=validated_data.pop('email'),
            phone=validated_data.pop('phone'),
            cin=validated_data.pop('cin'),
            date_of_birth=validated_data.pop('dateOfBirth'),
            gender=validated_data.pop('gender'),
            role=UserRole.PHARMACIST,
            is_phone_verified=False,
        )

        user.set_password(password)
        user.save()

        pharmacy = Pharmacy.objects.create(
            owner=user,
            name=pharmacy_name,
            license_number=license_number,
            phone=user.phone,
            address=f'{address}, {city}',
            location=Point(
                longitude,
                latitude,
                srid=4326,
            ),
            opens_at='08:00',
            closes_at='20:00',
            is_active=True,
            is_verified=False,
        )

        return {
            'userId': user.id,
            'pharmacyId': pharmacy.id,
            'firstName': user.first_name,
            'lastName': user.last_name,
            'email': user.email,
            'role': user.role,
            'verified': pharmacy.is_verified,
        }


class PharmacistLoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        email = attrs['email'].strip().lower()

        try:
            user = User.objects.get(
                email__iexact=email,
                role='pharmacist',
            )
        except User.DoesNotExist as exc:
            raise serializers.ValidationError(
                'Invalid credentials.'
            ) from exc

        if not user.check_password(attrs['password']):
            raise serializers.ValidationError(
                'Invalid credentials.'
            )

        if not user.is_active:
            raise serializers.ValidationError(
                'Account is disabled.'
            )

        try:
            pharmacy = user.pharmacy
        except Exception as exc:
            raise serializers.ValidationError(
                'No pharmacy is associated with this pharmacist account.'
            ) from exc

        if not pharmacy.is_active:
            raise serializers.ValidationError(
                'Pharmacy is disabled.'
            )

        if not pharmacy.is_verified:
            raise serializers.ValidationError(
                'Pharmacy is not verified yet.'
            )

        tokens = _tokens_for(user)

        tokens.update({
            'userId': user.id,
            'pharmacyId': pharmacy.id,
            'firstName': user.first_name,
            'lastName': user.last_name,
            'email': user.email,
            'role': user.role,
        })

        return tokens

class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField()
    device_id = serializers.CharField(
        required=False,
        allow_blank=False,
        max_length=128,
        trim_whitespace=True,
    )

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


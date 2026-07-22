import pytest
from django.urls import reverse
from rest_framework import status

from apps.authentication.models import OTPCode

pytestmark = pytest.mark.django_db


def test_signup_creates_user_and_otp(api_client, patient_payload):
    resp = api_client.post(reverse('v1:signup'), patient_payload, format='json')
    assert resp.status_code == status.HTTP_201_CREATED
    assert OTPCode.objects.filter(phone=patient_payload['phone']).count() == 1


def test_verify_otp_returns_tokens(api_client, patient_payload):
    api_client.post(reverse('v1:signup'), patient_payload, format='json')
    otp = OTPCode.objects.get(phone=patient_payload['phone'])
    resp = api_client.post(
        reverse('v1:verify-otp'),
        {
            'phone': patient_payload['phone'],
            'code': otp.code,
            'purpose': 'signup',
        },
        format='json',
    )
    assert resp.status_code == status.HTTP_200_OK
    assert 'access' in resp.data
    assert 'refresh' in resp.data


def test_login_blocked_until_verified(api_client, patient_payload):
    api_client.post(reverse('v1:signup'), patient_payload, format='json')
    resp = api_client.post(
        reverse('v1:login'),
        {
            'phone': patient_payload['phone'],
            'password': patient_payload['password'],
        },
        format='json',
    )
    assert resp.status_code == status.HTTP_400_BAD_REQUEST


def test_login_succeeds_after_verification(api_client, patient_payload):
    api_client.post(reverse('v1:signup'), patient_payload, format='json')
    otp = OTPCode.objects.get(phone=patient_payload['phone'])
    api_client.post(
        reverse('v1:verify-otp'),
        {'phone': patient_payload['phone'], 'code': otp.code},
        format='json',
    )
    resp = api_client.post(
        reverse('v1:login'),
        {
            'phone': patient_payload['phone'],
            'password': patient_payload['password'],
        },
        format='json',
    )
    assert resp.status_code == status.HTTP_200_OK


def test_invalid_otp_rejected(api_client, patient_payload):
    api_client.post(reverse('v1:signup'), patient_payload, format='json')
    resp = api_client.post(
        reverse('v1:verify-otp'),
        {'phone': patient_payload['phone'], 'code': '000000'},
        format='json',
    )
    assert resp.status_code == status.HTTP_400_BAD_REQUEST


def test_logout_blacklists_refresh_token(auth_client, patient):
    from rest_framework_simplejwt.tokens import RefreshToken

    refresh = RefreshToken.for_user(patient)
    resp = auth_client.post(
        reverse('v1:logout'),
        {'refresh': str(refresh)},
        format='json',
    )
    assert resp.status_code == status.HTTP_200_OK
    # Using the same refresh token again should fail
    resp2 = auth_client.post(
        reverse('v1:token-refresh'),
        {'refresh': str(refresh)},
        format='json',
    )
    assert resp2.status_code == status.HTTP_401_UNAUTHORIZED


def test_logout_with_invalid_token_rejected(auth_client):
    resp = auth_client.post(
        reverse('v1:logout'),
        {'refresh': 'invalid-token-string'},
        format='json',
    )
    assert resp.status_code == status.HTTP_400_BAD_REQUEST


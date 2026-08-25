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

def test_idle_delivery_agent_can_logout():
    from datetime import date

    from rest_framework.test import APIClient
    from rest_framework_simplejwt.tokens import RefreshToken

    from apps.core.constants import UserRole
    from apps.users.models import User

    agent = User.objects.create_user(
        phone="+212600940001",
        password="StrongPass123!",
        email="idle.logout.agent@example.com",
        cin="LO123451",
        first_name="Idle",
        last_name="Courier",
        date_of_birth=date(2000, 1, 1),
        gender="M",
        role=UserRole.DELIVERY,
        is_phone_verified=True,
    )

    refresh = RefreshToken.for_user(agent)

    client = APIClient()
    client.force_authenticate(user=agent)

    response = client.post(
        reverse("v1:logout"),
        {"refresh": str(refresh)},
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK

    refresh_response = APIClient().post(
        reverse("v1:token-refresh"),
        {"refresh": str(refresh)},
        format="json",
    )

    assert refresh_response.status_code == status.HTTP_401_UNAUTHORIZED


def test_active_delivery_agent_cannot_logout_and_refresh_token_stays_valid(patient):
    from datetime import date

    from django.contrib.gis.geos import Point
    from rest_framework.test import APIClient
    from rest_framework_simplejwt.tokens import RefreshToken

    from apps.core.constants import UserRole
    from apps.orders.constants import OrderStatus
    from apps.orders.models import Order
    from apps.users.models import User

    agent = User.objects.create_user(
        phone="+212600940002",
        password="StrongPass123!",
        email="active.logout.agent@example.com",
        cin="LO123452",
        first_name="Active",
        last_name="Courier",
        date_of_birth=date(2000, 1, 1),
        gender="M",
        role=UserRole.DELIVERY,
        is_phone_verified=True,
    )

    order = Order.objects.create(
        customer=patient,
        delivery_agent=agent,
        status=OrderStatus.AWAITING_AGENT,
        delivery_address="Test delivery address",
        delivery_location=Point(-7.5898, 33.5731, srid=4326),
    )

    refresh = RefreshToken.for_user(agent)

    client = APIClient()
    client.force_authenticate(user=agent)

    response = client.post(
        reverse("v1:logout"),
        {"refresh": str(refresh)},
        format="json",
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN

    order.refresh_from_db()
    assert order.delivery_agent_id == agent.id
    assert order.status == OrderStatus.AWAITING_AGENT

    refresh_response = APIClient().post(
        reverse("v1:token-refresh"),
        {"refresh": str(refresh)},
        format="json",
    )

    assert refresh_response.status_code == status.HTTP_200_OK
    assert "access" in refresh_response.data

def test_logout_with_device_id_deactivates_device_and_blacklists_token(patient):
    from rest_framework.test import APIClient
    from rest_framework_simplejwt.tokens import RefreshToken

    from apps.notifications.models import DevicePlatform
    from apps.notifications.services import register_user_device

    device = register_user_device(
        user=patient,
        device_id="logout-device-patient",
        platform=DevicePlatform.ANDROID,
        push_token="ExponentPushToken[logout-device-patient]",
        is_primary=True,
    )

    refresh = RefreshToken.for_user(patient)

    client = APIClient()
    client.force_authenticate(user=patient)

    response = client.post(
        reverse("v1:logout"),
        {
            "refresh": str(refresh),
            "device_id": "logout-device-patient",
        },
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK

    device.refresh_from_db()

    assert device.push_token is None
    assert device.is_active is False
    assert device.is_primary is False

    refresh_response = APIClient().post(
        reverse("v1:token-refresh"),
        {"refresh": str(refresh)},
        format="json",
    )

    assert refresh_response.status_code == status.HTTP_401_UNAUTHORIZED


def test_logout_without_device_id_keeps_registered_device_active(patient):
    from rest_framework.test import APIClient
    from rest_framework_simplejwt.tokens import RefreshToken

    from apps.notifications.models import DevicePlatform
    from apps.notifications.services import register_user_device

    device = register_user_device(
        user=patient,
        device_id="logout-without-device-id",
        platform=DevicePlatform.ANDROID,
        push_token="ExponentPushToken[logout-without-device-id]",
        is_primary=True,
    )

    refresh = RefreshToken.for_user(patient)

    client = APIClient()
    client.force_authenticate(user=patient)

    response = client.post(
        reverse("v1:logout"),
        {
            "refresh": str(refresh),
        },
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK

    device.refresh_from_db()

    assert device.push_token == "ExponentPushToken[logout-without-device-id]"
    assert device.is_active is True
    assert device.is_primary is True

    refresh_response = APIClient().post(
        reverse("v1:token-refresh"),
        {"refresh": str(refresh)},
        format="json",
    )

    assert refresh_response.status_code == status.HTTP_401_UNAUTHORIZED


def test_active_delivery_logout_with_device_id_preserves_device_and_token(patient):
    from datetime import date

    from django.contrib.gis.geos import Point
    from rest_framework.test import APIClient
    from rest_framework_simplejwt.tokens import RefreshToken

    from apps.core.constants import UserRole
    from apps.notifications.models import DevicePlatform
    from apps.notifications.services import register_user_device
    from apps.orders.constants import OrderStatus
    from apps.orders.models import Order
    from apps.users.models import User

    agent = User.objects.create_user(
        phone="+212600940003",
        password="StrongPass123!",
        email="active.logout.device.agent@example.com",
        cin="LO123453",
        first_name="ActiveDevice",
        last_name="Courier",
        date_of_birth=date(2000, 1, 1),
        gender="M",
        role=UserRole.DELIVERY,
        is_phone_verified=True,
    )

    device = register_user_device(
        user=agent,
        device_id="active-delivery-logout-device",
        platform=DevicePlatform.ANDROID,
        push_token="ExponentPushToken[active-delivery-logout-device]",
        is_primary=True,
    )

    order = Order.objects.create(
        customer=patient,
        delivery_agent=agent,
        status=OrderStatus.AWAITING_AGENT,
        delivery_address="Test delivery address",
        delivery_location=Point(-7.5898, 33.5731, srid=4326),
    )

    refresh = RefreshToken.for_user(agent)

    client = APIClient()
    client.force_authenticate(user=agent)

    response = client.post(
        reverse("v1:logout"),
        {
            "refresh": str(refresh),
            "device_id": "active-delivery-logout-device",
        },
        format="json",
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN

    device.refresh_from_db()
    order.refresh_from_db()

    assert device.push_token == (
        "ExponentPushToken[active-delivery-logout-device]"
    )
    assert device.is_active is True
    assert device.is_primary is True
    assert order.delivery_agent_id == agent.id
    assert order.status == OrderStatus.AWAITING_AGENT

    refresh_response = APIClient().post(
        reverse("v1:token-refresh"),
        {"refresh": str(refresh)},
        format="json",
    )

    assert refresh_response.status_code == status.HTTP_200_OK
    assert "access" in refresh_response.data


def test_logout_with_foreign_device_id_is_atomic(patient):
    from datetime import date

    from rest_framework.test import APIClient
    from rest_framework_simplejwt.tokens import RefreshToken

    from apps.core.constants import UserRole
    from apps.notifications.models import DevicePlatform
    from apps.notifications.services import register_user_device
    from apps.users.models import User

    other_user = User.objects.create_user(
        phone="+212600940004",
        password="StrongPass123!",
        email="foreign.logout.device@example.com",
        cin="LO123454",
        first_name="ForeignDevice",
        last_name="Owner",
        date_of_birth=date(2000, 1, 1),
        gender="M",
        role=UserRole.DELIVERY,
        is_phone_verified=True,
    )

    foreign_device = register_user_device(
        user=other_user,
        device_id="foreign-logout-device",
        platform=DevicePlatform.IOS,
        push_token="ExponentPushToken[foreign-logout-device]",
        is_primary=True,
    )

    refresh = RefreshToken.for_user(patient)

    client = APIClient()
    client.force_authenticate(user=patient)

    response = client.post(
        reverse("v1:logout"),
        {
            "refresh": str(refresh),
            "device_id": "foreign-logout-device",
        },
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST

    foreign_device.refresh_from_db()

    assert foreign_device.user_id == other_user.id
    assert foreign_device.push_token == "ExponentPushToken[foreign-logout-device]"
    assert foreign_device.is_active is True
    assert foreign_device.is_primary is True

    refresh_response = APIClient().post(
        reverse("v1:token-refresh"),
        {"refresh": str(refresh)},
        format="json",
    )

    assert refresh_response.status_code == status.HTTP_200_OK
    assert "access" in refresh_response.data


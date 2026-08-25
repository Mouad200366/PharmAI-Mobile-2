from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point
from django.urls import reverse
from rest_framework.test import APIClient

from apps.core.constants import UserRole
from apps.delivery.services.delivery_proof import issue_delivery_pin
from apps.orders.constants import OrderStatus, PaymentMethod
from apps.orders.models import Order
from apps.payments.constants import PaymentProvider, PaymentStatus
from apps.payments.models import Payment


User = get_user_model()


def _create_delivery_agent(*, phone, email, cin, first_name):
    return User.objects.create_user(
        phone=phone,
        password="StrongPass123!",
        email=email,
        cin=cin,
        first_name=first_name,
        last_name="Courier",
        date_of_birth=date(1993, 1, 1),
        gender="M",
        role=UserRole.DELIVERY,
        is_phone_verified=True,
    )


def _make_order(
    *,
    patient,
    pharmacy,
    agent,
    payment_method,
    payment_status,
):
    order = Order.objects.create(
        customer=patient,
        pharmacy=pharmacy,
        delivery_agent=agent,
        delivery_address="Maarif, Casablanca",
        delivery_location=Point(
            -7.6320,
            33.5860,
            srid=4326,
        ),
        items_total=Decimal("50.00"),
        delivery_fee=Decimal("15.00"),
        grand_total=Decimal("65.00"),
        status=OrderStatus.OUT_FOR_DELIVERY,
        payment_method=payment_method,
    )

    Payment.objects.create(
        order=order,
        provider=PaymentProvider(payment_method),
        amount=order.grand_total,
        status=payment_status,
    )

    return order


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def completion_api_agent(db):
    return _create_delivery_agent(
        phone="+212600770001",
        email="completion.api.agent@example.com",
        cin="CA123451",
        first_name="CompletionAPI",
    )


@pytest.fixture
def other_completion_api_agent(db):
    return _create_delivery_agent(
        phone="+212600770002",
        email="completion.api.other@example.com",
        cin="CA123452",
        first_name="OtherCompletionAPI",
    )


@pytest.fixture
def completion_api_cash_order(patient, pharmacy, completion_api_agent):
    return _make_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=completion_api_agent,
        payment_method=PaymentMethod.CASH,
        payment_status=PaymentStatus.PENDING,
    )


@pytest.fixture
def completion_api_card_order(patient, pharmacy, completion_api_agent):
    return _make_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=completion_api_agent,
        payment_method=PaymentMethod.CARD,
        payment_status=PaymentStatus.PAID,
    )


@pytest.mark.django_db
def test_assigned_agent_can_complete_cod_delivery(
    api_client,
    completion_api_cash_order,
    completion_api_agent,
    patient,
):
    issued = issue_delivery_pin(
        order_id=completion_api_cash_order.id,
        customer=patient,
    )

    api_client.force_authenticate(
        user=completion_api_agent,
    )

    url = reverse(
        "v1:order-complete-delivery",
        kwargs={"pk": completion_api_cash_order.id},
    )

    response = api_client.post(
        url,
        {
            "pin": issued["pin"],
            "latitude": 33.5731,
            "longitude": -7.5898,
            "cash_confirmed": True,
        },
        format="json",
    )

    assert response.status_code == 200

    completion_api_cash_order.refresh_from_db()
    completion_api_cash_order.payment.refresh_from_db()

    assert completion_api_cash_order.status == OrderStatus.DELIVERED
    assert completion_api_cash_order.payment.status == PaymentStatus.PAID


@pytest.mark.django_db
def test_cod_delivery_without_cash_confirmation_returns_400(
    api_client,
    completion_api_cash_order,
    completion_api_agent,
    patient,
):
    issued = issue_delivery_pin(
        order_id=completion_api_cash_order.id,
        customer=patient,
    )

    api_client.force_authenticate(
        user=completion_api_agent,
    )

    url = reverse(
        "v1:order-complete-delivery",
        kwargs={"pk": completion_api_cash_order.id},
    )

    response = api_client.post(
        url,
        {
            "pin": issued["pin"],
            "latitude": 33.5731,
            "longitude": -7.5898,
        },
        format="json",
    )

    assert response.status_code == 400

    completion_api_cash_order.refresh_from_db()
    completion_api_cash_order.payment.refresh_from_db()

    assert completion_api_cash_order.status == OrderStatus.OUT_FOR_DELIVERY
    assert completion_api_cash_order.payment.status == PaymentStatus.PENDING


@pytest.mark.django_db
def test_complete_delivery_rejects_invalid_pin_format(
    api_client,
    completion_api_cash_order,
    completion_api_agent,
):
    api_client.force_authenticate(
        user=completion_api_agent,
    )

    url = reverse(
        "v1:order-complete-delivery",
        kwargs={"pk": completion_api_cash_order.id},
    )

    response = api_client.post(
        url,
        {
            "pin": "12AB",
            "latitude": 33.5731,
            "longitude": -7.5898,
            "cash_confirmed": True,
        },
        format="json",
    )

    assert response.status_code == 400

    completion_api_cash_order.refresh_from_db()
    assert completion_api_cash_order.status == OrderStatus.OUT_FOR_DELIVERY


@pytest.mark.django_db
def test_other_delivery_agent_cannot_complete_delivery(
    api_client,
    completion_api_cash_order,
    other_completion_api_agent,
    patient,
):
    issued = issue_delivery_pin(
        order_id=completion_api_cash_order.id,
        customer=patient,
    )

    api_client.force_authenticate(
        user=other_completion_api_agent,
    )

    url = reverse(
        "v1:order-complete-delivery",
        kwargs={"pk": completion_api_cash_order.id},
    )

    response = api_client.post(
        url,
        {
            "pin": issued["pin"],
            "latitude": 33.5731,
            "longitude": -7.5898,
            "cash_confirmed": True,
        },
        format="json",
    )

    assert response.status_code == 404

    completion_api_cash_order.refresh_from_db()
    assert completion_api_cash_order.status == OrderStatus.OUT_FOR_DELIVERY


@pytest.mark.django_db
def test_paid_card_delivery_can_complete_without_cash_confirmation(
    api_client,
    completion_api_card_order,
    completion_api_agent,
    patient,
):
    issued = issue_delivery_pin(
        order_id=completion_api_card_order.id,
        customer=patient,
    )

    api_client.force_authenticate(
        user=completion_api_agent,
    )

    url = reverse(
        "v1:order-complete-delivery",
        kwargs={"pk": completion_api_card_order.id},
    )

    response = api_client.post(
        url,
        {
            "pin": issued["pin"],
            "latitude": 33.5731,
            "longitude": -7.5898,
        },
        format="json",
    )

    assert response.status_code == 200

    completion_api_card_order.refresh_from_db()
    completion_api_card_order.payment.refresh_from_db()

    assert completion_api_card_order.status == OrderStatus.DELIVERED
    assert completion_api_card_order.payment.status == PaymentStatus.PAID

@pytest.mark.django_db
def test_customer_can_issue_delivery_pin_via_api(
    api_client,
    completion_api_cash_order,
    patient,
):
    from django.contrib.auth.hashers import check_password

    from apps.delivery.models import (
        DeliveryVerification,
        DeliveryVerificationType,
    )

    api_client.force_authenticate(user=patient)

    url = reverse(
        "v1:delivery-pin-issue",
        kwargs={"order_id": completion_api_cash_order.id},
    )

    response = api_client.post(
        url,
        {},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["pin"].isdigit()
    assert len(response.data["pin"]) == 6
    assert response.data["expires_at"] is not None

    verification = DeliveryVerification.objects.get(
        order=completion_api_cash_order,
        verification_type=DeliveryVerificationType.DELIVERY,
    )

    assert verification.pin_hash != response.data["pin"]
    assert check_password(
        response.data["pin"],
        verification.pin_hash,
    )


@pytest.mark.django_db
def test_other_user_cannot_issue_delivery_pin_via_api(
    api_client,
    completion_api_cash_order,
    other_completion_api_agent,
):
    from apps.delivery.models import (
        DeliveryVerification,
        DeliveryVerificationType,
    )

    api_client.force_authenticate(
        user=other_completion_api_agent,
    )

    url = reverse(
        "v1:delivery-pin-issue",
        kwargs={"order_id": completion_api_cash_order.id},
    )

    response = api_client.post(
        url,
        {},
        format="json",
    )

    assert response.status_code == 400
    assert not DeliveryVerification.objects.filter(
        order=completion_api_cash_order,
        verification_type=DeliveryVerificationType.DELIVERY,
    ).exists()


@pytest.mark.django_db
def test_delivery_pin_issue_api_rejects_wrong_order_status(
    api_client,
    completion_api_cash_order,
    patient,
):
    completion_api_cash_order.status = OrderStatus.PICKED_UP
    completion_api_cash_order.save(
        update_fields=(
            "status",
            "updated_at",
        )
    )

    api_client.force_authenticate(user=patient)

    url = reverse(
        "v1:delivery-pin-issue",
        kwargs={"order_id": completion_api_cash_order.id},
    )

    response = api_client.post(
        url,
        {},
        format="json",
    )

    assert response.status_code == 400


@pytest.mark.django_db
def test_reissuing_delivery_pin_via_api_rotates_stored_pin(
    api_client,
    completion_api_cash_order,
    patient,
):
    from django.contrib.auth.hashers import check_password

    from apps.delivery.models import (
        DeliveryVerification,
        DeliveryVerificationType,
    )

    api_client.force_authenticate(user=patient)

    url = reverse(
        "v1:delivery-pin-issue",
        kwargs={"order_id": completion_api_cash_order.id},
    )

    first_response = api_client.post(
        url,
        {},
        format="json",
    )
    assert first_response.status_code == 200

    first_pin = first_response.data["pin"]

    second_response = api_client.post(
        url,
        {},
        format="json",
    )
    assert second_response.status_code == 200

    second_pin = second_response.data["pin"]

    verification = DeliveryVerification.objects.get(
        order=completion_api_cash_order,
        verification_type=DeliveryVerificationType.DELIVERY,
    )

    assert check_password(
        second_pin,
        verification.pin_hash,
    )

    if first_pin != second_pin:
        assert not check_password(
            first_pin,
            verification.pin_hash,
        )


from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.constants import UserRole
from apps.delivery.models import (
    AgentCashTransaction,
    AgentCashTransactionType,
    CashSettlement,
    CashSettlementStatus,
    DeliveryEarning,
    DeliveryEarningStatus,
)
from apps.orders.constants import OrderStatus, PaymentMethod
from apps.orders.models import Order


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


def _create_order(*, patient, pharmacy, agent):
    return Order.objects.create(
        customer=patient,
        pharmacy=pharmacy,
        delivery_agent=agent,
        delivery_address="Maarif, Casablanca",
        delivery_location=Point(-7.6320, 33.5860, srid=4326),
        items_total=Decimal("50.00"),
        delivery_fee=Decimal("15.00"),
        grand_total=Decimal("65.00"),
        status=OrderStatus.DELIVERED,
        payment_method=PaymentMethod.CASH,
    )


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def finance_api_agent(db):
    return _create_delivery_agent(
        phone="+212600830001",
        email="finance.api.agent@example.com",
        cin="FA123451",
        first_name="FinanceAPI",
    )


@pytest.mark.django_db
def test_delivery_agent_can_read_earnings_summary(
    api_client,
    finance_api_agent,
    patient,
    pharmacy,
):
    now = timezone.now()

    earned_order = _create_order(patient=patient, pharmacy=pharmacy, agent=finance_api_agent)
    paid_order = _create_order(patient=patient, pharmacy=pharmacy, agent=finance_api_agent)
    pending_order = _create_order(patient=patient, pharmacy=pharmacy, agent=finance_api_agent)

    DeliveryEarning.objects.create(
        order=earned_order,
        agent=finance_api_agent,
        amount=Decimal("15.00"),
        status=DeliveryEarningStatus.EARNED,
        earned_at=now,
    )

    DeliveryEarning.objects.create(
        order=paid_order,
        agent=finance_api_agent,
        amount=Decimal("20.00"),
        status=DeliveryEarningStatus.PAID,
        earned_at=now,
        paid_at=now,
    )

    DeliveryEarning.objects.create(
        order=pending_order,
        agent=finance_api_agent,
        amount=Decimal("99.00"),
        status=DeliveryEarningStatus.PENDING,
    )

    api_client.force_authenticate(user=finance_api_agent)

    response = api_client.get(reverse("v1:delivery-earnings-summary"))

    assert response.status_code == 200
    assert response.data["today_earned"] == Decimal("35.00")
    assert response.data["total_earned"] == Decimal("35.00")
    assert response.data["total_paid"] == Decimal("20.00")
    assert response.data["currency"] == "MAD"


@pytest.mark.django_db
def test_earning_history_is_privacy_safe(
    api_client,
    finance_api_agent,
    patient,
    pharmacy,
):
    order = _create_order(patient=patient, pharmacy=pharmacy, agent=finance_api_agent)

    earning = DeliveryEarning.objects.create(
        order=order,
        agent=finance_api_agent,
        amount=Decimal("15.00"),
        status=DeliveryEarningStatus.EARNED,
        earned_at=timezone.now(),
    )

    api_client.force_authenticate(user=finance_api_agent)

    response = api_client.get(reverse("v1:delivery-earnings-history"))

    assert response.status_code == 200
    assert len(response.data) == 1

    item = response.data[0]

    assert item["id"] == earning.id
    assert item["order_id"] == order.id
    assert Decimal(item["amount"]) == Decimal("15.00")
    assert item["currency"] == "MAD"
    assert item["status"] == DeliveryEarningStatus.EARNED

    assert "customer" not in item
    assert "delivery_address" not in item
    assert "medicine" not in item
    assert "prescription" not in item


@pytest.mark.django_db
def test_delivery_agent_can_read_outstanding_cash_summary(
    api_client,
    finance_api_agent,
    patient,
    pharmacy,
):
    order = _create_order(patient=patient, pharmacy=pharmacy, agent=finance_api_agent)

    AgentCashTransaction.objects.create(
        agent=finance_api_agent,
        order=order,
        transaction_type=AgentCashTransactionType.COLLECTION,
        amount=Decimal("65.00"),
        currency="MAD",
    )

    AgentCashTransaction.objects.create(
        agent=finance_api_agent,
        transaction_type=AgentCashTransactionType.SETTLEMENT,
        amount=Decimal("-25.00"),
        currency="MAD",
    )

    api_client.force_authenticate(user=finance_api_agent)

    response = api_client.get(reverse("v1:delivery-cash-summary"))

    assert response.status_code == 200
    assert response.data["outstanding_cash"] == Decimal("40.00")
    assert response.data["currency"] == "MAD"


@pytest.mark.django_db
def test_delivery_agent_can_read_settlement_history(
    api_client,
    finance_api_agent,
):
    completed = CashSettlement.objects.create(
        agent=finance_api_agent,
        amount=Decimal("30.00"),
        currency="MAD",
        status=CashSettlementStatus.COMPLETED,
        completed_at=timezone.now(),
        note="Handed over at pharmacy.",
    )

    pending = CashSettlement.objects.create(
        agent=finance_api_agent,
        amount=Decimal("20.00"),
        currency="MAD",
        status=CashSettlementStatus.PENDING,
    )

    api_client.force_authenticate(user=finance_api_agent)

    response = api_client.get(reverse("v1:delivery-cash-settlements"))

    assert response.status_code == 200
    assert [item["id"] for item in response.data] == [pending.id, completed.id]
    assert Decimal(response.data[0]["amount"]) == Decimal("20.00")
    assert response.data[0]["status"] == CashSettlementStatus.PENDING


@pytest.mark.django_db
def test_patient_cannot_access_delivery_financial_endpoints(
    api_client,
    patient,
):
    api_client.force_authenticate(user=patient)

    route_names = (
        "v1:delivery-earnings-summary",
        "v1:delivery-earnings-history",
        "v1:delivery-cash-summary",
        "v1:delivery-cash-settlements",
    )

    for route_name in route_names:
        response = api_client.get(reverse(route_name))
        assert response.status_code == 403
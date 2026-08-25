from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point
from django.utils import timezone

from apps.core.constants import UserRole
from apps.delivery.models import (
    AgentCashTransaction,
    AgentCashTransactionType,
    CashSettlement,
    CashSettlementStatus,
    DeliveryEarning,
    DeliveryEarningStatus,
)
from apps.delivery.services.financial_summary import (
    get_cash_summary,
    get_earning_history,
    get_earnings_summary,
    get_settlement_history,
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
        delivery_location=Point(
            -7.6320,
            33.5860,
            srid=4326,
        ),
        items_total=Decimal("50.00"),
        delivery_fee=Decimal("15.00"),
        grand_total=Decimal("65.00"),
        status=OrderStatus.DELIVERED,
        payment_method=PaymentMethod.CASH,
    )


@pytest.fixture
def financial_agent(db):
    return _create_delivery_agent(
        phone="+212600820001",
        email="financial.agent@example.com",
        cin="FS123451",
        first_name="Financial",
    )


@pytest.fixture
def other_financial_agent(db):
    return _create_delivery_agent(
        phone="+212600820002",
        email="financial.other@example.com",
        cin="FS123452",
        first_name="OtherFinancial",
    )


@pytest.mark.django_db
def test_earnings_summary_counts_earned_and_paid_correctly(
    financial_agent,
    patient,
    pharmacy,
):
    now = timezone.now()
    yesterday = now - timedelta(days=1)

    order_one = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=financial_agent,
    )
    order_two = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=financial_agent,
    )
    order_three = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=financial_agent,
    )
    order_four = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=financial_agent,
    )

    DeliveryEarning.objects.create(
        order=order_one,
        agent=financial_agent,
        amount=Decimal("15.00"),
        status=DeliveryEarningStatus.EARNED,
        earned_at=now,
    )

    DeliveryEarning.objects.create(
        order=order_two,
        agent=financial_agent,
        amount=Decimal("20.00"),
        status=DeliveryEarningStatus.PAID,
        earned_at=now,
        paid_at=now,
    )

    DeliveryEarning.objects.create(
        order=order_three,
        agent=financial_agent,
        amount=Decimal("10.00"),
        status=DeliveryEarningStatus.EARNED,
        earned_at=yesterday,
    )

    DeliveryEarning.objects.create(
        order=order_four,
        agent=financial_agent,
        amount=Decimal("99.00"),
        status=DeliveryEarningStatus.PENDING,
    )

    summary = get_earnings_summary(
        agent=financial_agent,
    )

    assert summary["today_earned"] == Decimal("35.00")
    assert summary["total_earned"] == Decimal("45.00")
    assert summary["total_paid"] == Decimal("20.00")
    assert summary["currency"] == "MAD"


@pytest.mark.django_db
def test_earning_history_is_scoped_to_agent_and_newest_first(
    financial_agent,
    other_financial_agent,
    patient,
    pharmacy,
):
    first_order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=financial_agent,
    )
    second_order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=financial_agent,
    )
    other_order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=other_financial_agent,
    )

    first = DeliveryEarning.objects.create(
        order=first_order,
        agent=financial_agent,
        amount=Decimal("10.00"),
        status=DeliveryEarningStatus.EARNED,
        earned_at=timezone.now(),
    )

    second = DeliveryEarning.objects.create(
        order=second_order,
        agent=financial_agent,
        amount=Decimal("15.00"),
        status=DeliveryEarningStatus.EARNED,
        earned_at=timezone.now(),
    )

    DeliveryEarning.objects.create(
        order=other_order,
        agent=other_financial_agent,
        amount=Decimal("50.00"),
        status=DeliveryEarningStatus.EARNED,
        earned_at=timezone.now(),
    )

    history = list(
        get_earning_history(
            agent=financial_agent,
        )
    )

    assert [item.id for item in history] == [
        second.id,
        first.id,
    ]


@pytest.mark.django_db
def test_cash_summary_returns_signed_outstanding_balance(
    financial_agent,
    patient,
    pharmacy,
):
    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=financial_agent,
    )

    AgentCashTransaction.objects.create(
        agent=financial_agent,
        order=order,
        transaction_type=AgentCashTransactionType.COLLECTION,
        amount=Decimal("65.00"),
        currency="MAD",
    )

    AgentCashTransaction.objects.create(
        agent=financial_agent,
        transaction_type=AgentCashTransactionType.SETTLEMENT,
        amount=Decimal("-25.00"),
        currency="MAD",
    )

    summary = get_cash_summary(
        agent=financial_agent,
    )

    assert summary["outstanding_cash"] == Decimal("40.00")
    assert summary["currency"] == "MAD"


@pytest.mark.django_db
def test_settlement_history_is_scoped_to_agent_and_newest_first(
    financial_agent,
    other_financial_agent,
):
    first = CashSettlement.objects.create(
        agent=financial_agent,
        amount=Decimal("20.00"),
        status=CashSettlementStatus.COMPLETED,
        completed_at=timezone.now(),
    )

    second = CashSettlement.objects.create(
        agent=financial_agent,
        amount=Decimal("30.00"),
        status=CashSettlementStatus.PENDING,
    )

    CashSettlement.objects.create(
        agent=other_financial_agent,
        amount=Decimal("50.00"),
        status=CashSettlementStatus.PENDING,
    )

    history = list(
        get_settlement_history(
            agent=financial_agent,
        )
    )

    assert [item.id for item in history] == [
        second.id,
        first.id,
    ]
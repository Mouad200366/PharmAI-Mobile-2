from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point
from rest_framework.exceptions import ValidationError

from apps.core.constants import UserRole
from apps.delivery.models import (
    AgentCashTransaction,
    AgentCashTransactionType,
    CashSettlement,
    CashSettlementStatus,
)
from apps.delivery.services.cash_settlements import (
    complete_cash_settlement,
    get_agent_cash_balance,
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


def _create_cod_order(*, patient, pharmacy, agent):
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
def settlement_agent(db):
    return _create_delivery_agent(
        phone="+212600810001",
        email="settlement.agent@example.com",
        cin="CS123451",
        first_name="Settlement",
    )


@pytest.fixture
def settlement_order(patient, pharmacy, settlement_agent):
    return _create_cod_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=settlement_agent,
    )


@pytest.fixture
def collected_cash(settlement_agent, settlement_order):
    return AgentCashTransaction.objects.create(
        agent=settlement_agent,
        order=settlement_order,
        transaction_type=AgentCashTransactionType.COLLECTION,
        amount=Decimal("65.00"),
        currency="MAD",
        note="COD cash collected on delivery.",
    )


@pytest.mark.django_db
def test_agent_cash_balance_sums_signed_ledger_entries(
    settlement_agent,
    collected_cash,
):
    AgentCashTransaction.objects.create(
        agent=settlement_agent,
        transaction_type=AgentCashTransactionType.ADJUSTMENT,
        amount=Decimal("5.00"),
        currency="MAD",
        note="Positive correction.",
    )

    AgentCashTransaction.objects.create(
        agent=settlement_agent,
        transaction_type=AgentCashTransactionType.SETTLEMENT,
        amount=Decimal("-20.00"),
        currency="MAD",
        note="Previous settlement.",
    )

    balance = get_agent_cash_balance(
        agent=settlement_agent,
    )

    assert balance == Decimal("50.00")


@pytest.mark.django_db
def test_complete_cash_settlement_creates_negative_ledger_entry(
    settlement_agent,
    collected_cash,
):
    settlement = CashSettlement.objects.create(
        agent=settlement_agent,
        amount=Decimal("40.00"),
        currency="MAD",
    )

    completed = complete_cash_settlement(
        settlement_id=settlement.id,
    )

    completed.refresh_from_db()

    ledger_entry = AgentCashTransaction.objects.get(
        agent=settlement_agent,
        transaction_type=AgentCashTransactionType.SETTLEMENT,
    )

    assert completed.status == CashSettlementStatus.COMPLETED
    assert completed.completed_at is not None

    assert ledger_entry.amount == Decimal("-40.00")
    assert ledger_entry.currency == "MAD"
    assert ledger_entry.order_id is None

    assert get_agent_cash_balance(
        agent=settlement_agent,
    ) == Decimal("25.00")


@pytest.mark.django_db
def test_cash_settlement_cannot_exceed_current_balance(
    settlement_agent,
    collected_cash,
):
    settlement = CashSettlement.objects.create(
        agent=settlement_agent,
        amount=Decimal("70.00"),
        currency="MAD",
    )

    with pytest.raises(
        ValidationError,
        match="Settlement amount exceeds the courier's current cash balance",
    ):
        complete_cash_settlement(
            settlement_id=settlement.id,
        )

    settlement.refresh_from_db()

    assert settlement.status == CashSettlementStatus.PENDING
    assert settlement.completed_at is None

    assert not AgentCashTransaction.objects.filter(
        agent=settlement_agent,
        transaction_type=AgentCashTransactionType.SETTLEMENT,
    ).exists()


@pytest.mark.django_db
def test_cash_settlement_cannot_be_completed_twice(
    settlement_agent,
    collected_cash,
):
    settlement = CashSettlement.objects.create(
        agent=settlement_agent,
        amount=Decimal("30.00"),
        currency="MAD",
    )

    complete_cash_settlement(
        settlement_id=settlement.id,
    )

    with pytest.raises(
        ValidationError,
        match="This cash settlement is no longer pending",
    ):
        complete_cash_settlement(
            settlement_id=settlement.id,
        )

    assert AgentCashTransaction.objects.filter(
        agent=settlement_agent,
        transaction_type=AgentCashTransactionType.SETTLEMENT,
    ).count() == 1

    assert get_agent_cash_balance(
        agent=settlement_agent,
    ) == Decimal("35.00")
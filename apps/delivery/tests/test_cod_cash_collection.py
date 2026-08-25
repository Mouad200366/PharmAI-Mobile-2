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
)
from apps.delivery.services.delivery_proof import (
    complete_delivery,
    issue_delivery_pin,
)
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
def cash_ledger_agent(db):
    return _create_delivery_agent(
        phone="+212600800001",
        email="cash.ledger.agent@example.com",
        cin="CL123451",
        first_name="CashLedger",
    )


@pytest.fixture
def cash_ledger_cod_order(patient, pharmacy, cash_ledger_agent):
    return _make_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=cash_ledger_agent,
        payment_method=PaymentMethod.CASH,
        payment_status=PaymentStatus.PENDING,
    )


@pytest.fixture
def cash_ledger_card_order(patient, pharmacy, cash_ledger_agent):
    return _make_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=cash_ledger_agent,
        payment_method=PaymentMethod.CARD,
        payment_status=PaymentStatus.PAID,
    )


@pytest.mark.django_db
def test_successful_cod_delivery_creates_cash_collection(
    cash_ledger_cod_order,
    cash_ledger_agent,
    patient,
):
    issued = issue_delivery_pin(
        order_id=cash_ledger_cod_order.id,
        customer=patient,
    )

    complete_delivery(
        order_id=cash_ledger_cod_order.id,
        agent=cash_ledger_agent,
        pin=issued["pin"],
        latitude=33.5731,
        longitude=-7.5898,
        cash_confirmed=True,
    )

    transaction = AgentCashTransaction.objects.get(
        order=cash_ledger_cod_order,
        transaction_type=AgentCashTransactionType.COLLECTION,
    )

    assert transaction.agent_id == cash_ledger_agent.id
    assert transaction.amount == Decimal("65.00")
    assert transaction.amount > 0
    assert transaction.currency == "MAD"
    assert transaction.note == "COD cash collected on delivery."


@pytest.mark.django_db
def test_successful_cod_delivery_creates_only_one_collection(
    cash_ledger_cod_order,
    cash_ledger_agent,
    patient,
):
    issued = issue_delivery_pin(
        order_id=cash_ledger_cod_order.id,
        customer=patient,
    )

    complete_delivery(
        order_id=cash_ledger_cod_order.id,
        agent=cash_ledger_agent,
        pin=issued["pin"],
        latitude=33.5731,
        longitude=-7.5898,
        cash_confirmed=True,
    )

    assert AgentCashTransaction.objects.filter(
        order=cash_ledger_cod_order,
        transaction_type=AgentCashTransactionType.COLLECTION,
    ).count() == 1


@pytest.mark.django_db
def test_card_delivery_creates_no_cash_collection(
    cash_ledger_card_order,
    cash_ledger_agent,
    patient,
):
    issued = issue_delivery_pin(
        order_id=cash_ledger_card_order.id,
        customer=patient,
    )

    complete_delivery(
        order_id=cash_ledger_card_order.id,
        agent=cash_ledger_agent,
        pin=issued["pin"],
        latitude=33.5731,
        longitude=-7.5898,
        cash_confirmed=False,
    )

    assert not AgentCashTransaction.objects.filter(
        order=cash_ledger_card_order,
    ).exists()


@pytest.mark.django_db
def test_failed_cod_completion_creates_no_cash_collection(
    cash_ledger_cod_order,
    cash_ledger_agent,
    patient,
):
    issue_delivery_pin(
        order_id=cash_ledger_cod_order.id,
        customer=patient,
    )

    with pytest.raises(
        ValidationError,
        match="Invalid delivery PIN",
    ):
        complete_delivery(
            order_id=cash_ledger_cod_order.id,
            agent=cash_ledger_agent,
            pin="999999",
            latitude=33.5731,
            longitude=-7.5898,
            cash_confirmed=True,
        )

    assert not AgentCashTransaction.objects.filter(
        order=cash_ledger_cod_order,
    ).exists()
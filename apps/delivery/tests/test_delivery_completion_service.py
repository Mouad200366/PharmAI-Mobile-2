from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point
from rest_framework.exceptions import ValidationError

from apps.core.constants import UserRole
from apps.delivery.models import (
    DeliveryVerification,
    DeliveryVerificationMethod,
    DeliveryVerificationType,
)
from apps.delivery.services.delivery_proof import (
    complete_delivery,
    issue_delivery_pin,
)
from apps.orders.constants import OrderStatus, PaymentMethod
from apps.orders.models import Order, OrderStatusHistory
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


@pytest.fixture
def completion_agent(db):
    return _create_delivery_agent(
        phone="+212600760001",
        email="completion.agent@example.com",
        cin="DC123451",
        first_name="Completion",
    )


@pytest.fixture
def other_completion_agent(db):
    return _create_delivery_agent(
        phone="+212600760002",
        email="completion.other@example.com",
        cin="DC123452",
        first_name="OtherCompletion",
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
def cash_delivery_order(patient, pharmacy, completion_agent):
    return _make_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=completion_agent,
        payment_method=PaymentMethod.CASH,
        payment_status=PaymentStatus.PENDING,
    )


@pytest.fixture
def paid_card_delivery_order(patient, pharmacy, completion_agent):
    return _make_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=completion_agent,
        payment_method=PaymentMethod.CARD,
        payment_status=PaymentStatus.PAID,
    )


@pytest.mark.django_db
def test_cod_delivery_requires_cash_confirmation(
    cash_delivery_order,
    completion_agent,
    patient,
):
    issued = issue_delivery_pin(
        order_id=cash_delivery_order.id,
        customer=patient,
    )

    with pytest.raises(
        ValidationError,
        match="Cash collection must be confirmed",
    ):
        complete_delivery(
            order_id=cash_delivery_order.id,
            agent=completion_agent,
            pin=issued["pin"],
            latitude=33.5731,
            longitude=-7.5898,
            cash_confirmed=False,
        )

    cash_delivery_order.refresh_from_db()
    cash_delivery_order.payment.refresh_from_db()

    assert cash_delivery_order.status == OrderStatus.OUT_FOR_DELIVERY
    assert cash_delivery_order.payment.status == PaymentStatus.PENDING


@pytest.mark.django_db
def test_cod_delivery_success_marks_payment_paid_and_order_delivered(
    cash_delivery_order,
    completion_agent,
    patient,
):
    issued = issue_delivery_pin(
        order_id=cash_delivery_order.id,
        customer=patient,
    )

    order = complete_delivery(
        order_id=cash_delivery_order.id,
        agent=completion_agent,
        pin=issued["pin"],
        latitude=33.5731,
        longitude=-7.5898,
        cash_confirmed=True,
    )

    order.refresh_from_db()
    order.payment.refresh_from_db()

    verification = DeliveryVerification.objects.get(
        order=order,
        verification_type=DeliveryVerificationType.DELIVERY,
    )

    assert order.status == OrderStatus.DELIVERED
    assert order.payment.status == PaymentStatus.PAID
    assert order.payment.paid_at is not None

    assert verification.used_at is not None
    assert verification.verification_method == DeliveryVerificationMethod.PIN
    assert verification.verified_by_id == completion_agent.id
    assert verification.verified_location is not None

    history = OrderStatusHistory.objects.filter(
        order=order,
        status=OrderStatus.DELIVERED,
    ).latest("created_at")

    assert history.changed_by_id == completion_agent.id
    assert history.note == "Delivery completed with customer PIN verification."


@pytest.mark.django_db
def test_paid_card_order_can_be_completed_without_cash_confirmation(
    paid_card_delivery_order,
    completion_agent,
    patient,
):
    issued = issue_delivery_pin(
        order_id=paid_card_delivery_order.id,
        customer=patient,
    )

    order = complete_delivery(
        order_id=paid_card_delivery_order.id,
        agent=completion_agent,
        pin=issued["pin"],
        latitude=33.5731,
        longitude=-7.5898,
        cash_confirmed=False,
    )

    order.refresh_from_db()
    order.payment.refresh_from_db()

    assert order.status == OrderStatus.DELIVERED
    assert order.payment.status == PaymentStatus.PAID


@pytest.mark.django_db
def test_unpaid_card_order_cannot_be_completed(
    paid_card_delivery_order,
    completion_agent,
    patient,
):
    paid_card_delivery_order.payment.status = PaymentStatus.PENDING
    paid_card_delivery_order.payment.save(
        update_fields=(
            "status",
            "updated_at",
        )
    )

    issued = issue_delivery_pin(
        order_id=paid_card_delivery_order.id,
        customer=patient,
    )

    with pytest.raises(
        ValidationError,
        match="Online payment is not confirmed as paid",
    ):
        complete_delivery(
            order_id=paid_card_delivery_order.id,
            agent=completion_agent,
            pin=issued["pin"],
            latitude=33.5731,
            longitude=-7.5898,
        )

    paid_card_delivery_order.refresh_from_db()
    assert paid_card_delivery_order.status == OrderStatus.OUT_FOR_DELIVERY


@pytest.mark.django_db
def test_wrong_delivery_pin_counts_failed_attempt(
    cash_delivery_order,
    completion_agent,
    patient,
):
    issue_delivery_pin(
        order_id=cash_delivery_order.id,
        customer=patient,
    )

    with pytest.raises(
        ValidationError,
        match="Invalid delivery PIN",
    ):
        complete_delivery(
            order_id=cash_delivery_order.id,
            agent=completion_agent,
            pin="999999",
            latitude=33.5731,
            longitude=-7.5898,
            cash_confirmed=True,
        )

    verification = DeliveryVerification.objects.get(
        order=cash_delivery_order,
        verification_type=DeliveryVerificationType.DELIVERY,
    )

    cash_delivery_order.refresh_from_db()
    cash_delivery_order.payment.refresh_from_db()

    assert verification.failed_attempts == 1
    assert verification.last_failed_at is not None
    assert verification.used_at is None
    assert cash_delivery_order.status == OrderStatus.OUT_FOR_DELIVERY
    assert cash_delivery_order.payment.status == PaymentStatus.PENDING


@pytest.mark.django_db
def test_wrong_agent_cannot_complete_delivery(
    cash_delivery_order,
    other_completion_agent,
    patient,
):
    issued = issue_delivery_pin(
        order_id=cash_delivery_order.id,
        customer=patient,
    )

    with pytest.raises(
        ValidationError,
        match="You are not the assigned delivery agent",
    ):
        complete_delivery(
            order_id=cash_delivery_order.id,
            agent=other_completion_agent,
            pin=issued["pin"],
            latitude=33.5731,
            longitude=-7.5898,
            cash_confirmed=True,
        )

    cash_delivery_order.refresh_from_db()
    assert cash_delivery_order.status == OrderStatus.OUT_FOR_DELIVERY
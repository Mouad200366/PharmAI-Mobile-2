from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point
from rest_framework.exceptions import ValidationError

from apps.core.constants import UserRole
from apps.delivery.models import (
    DeliveryEarning,
    DeliveryEarningStatus,
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


@pytest.fixture
def earning_completion_agent(db):
    return _create_delivery_agent(
        phone="+212600790001",
        email="earning.completion.agent@example.com",
        cin="EC123451",
        first_name="EarningCompletion",
    )


@pytest.fixture
def earning_completion_order(
    patient,
    pharmacy,
    earning_completion_agent,
):
    order = Order.objects.create(
        customer=patient,
        pharmacy=pharmacy,
        delivery_agent=earning_completion_agent,
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
        payment_method=PaymentMethod.CASH,
    )

    Payment.objects.create(
        order=order,
        provider=PaymentProvider.CASH,
        amount=order.grand_total,
        status=PaymentStatus.PENDING,
    )

    DeliveryEarning.objects.create(
        order=order,
        agent=earning_completion_agent,
        amount=Decimal("15.00"),
        status=DeliveryEarningStatus.PENDING,
    )

    return order


@pytest.mark.django_db
def test_successful_delivery_marks_earning_earned(
    earning_completion_order,
    earning_completion_agent,
    patient,
):
    issued = issue_delivery_pin(
        order_id=earning_completion_order.id,
        customer=patient,
    )

    complete_delivery(
        order_id=earning_completion_order.id,
        agent=earning_completion_agent,
        pin=issued["pin"],
        latitude=33.5731,
        longitude=-7.5898,
        cash_confirmed=True,
    )

    earning = DeliveryEarning.objects.get(
        order=earning_completion_order,
    )

    earning_completion_order.refresh_from_db()

    assert earning_completion_order.status == OrderStatus.DELIVERED
    assert earning.status == DeliveryEarningStatus.EARNED
    assert earning.earned_at is not None
    assert earning.paid_at is None


@pytest.mark.django_db
def test_failed_pin_attempt_keeps_earning_pending(
    earning_completion_order,
    earning_completion_agent,
    patient,
):
    issue_delivery_pin(
        order_id=earning_completion_order.id,
        customer=patient,
    )

    with pytest.raises(
        ValidationError,
        match="Invalid delivery PIN",
    ):
        complete_delivery(
            order_id=earning_completion_order.id,
            agent=earning_completion_agent,
            pin="999999",
            latitude=33.5731,
            longitude=-7.5898,
            cash_confirmed=True,
        )

    earning = DeliveryEarning.objects.get(
        order=earning_completion_order,
    )

    earning_completion_order.refresh_from_db()

    assert earning_completion_order.status == OrderStatus.OUT_FOR_DELIVERY
    assert earning.status == DeliveryEarningStatus.PENDING
    assert earning.earned_at is None
    assert earning.paid_at is None


@pytest.mark.django_db
def test_missing_cod_confirmation_keeps_earning_pending(
    earning_completion_order,
    earning_completion_agent,
    patient,
):
    issued = issue_delivery_pin(
        order_id=earning_completion_order.id,
        customer=patient,
    )

    with pytest.raises(
        ValidationError,
        match="Cash collection must be confirmed",
    ):
        complete_delivery(
            order_id=earning_completion_order.id,
            agent=earning_completion_agent,
            pin=issued["pin"],
            latitude=33.5731,
            longitude=-7.5898,
            cash_confirmed=False,
        )

    earning = DeliveryEarning.objects.get(
        order=earning_completion_order,
    )

    earning_completion_order.refresh_from_db()

    assert earning_completion_order.status == OrderStatus.OUT_FOR_DELIVERY
    assert earning.status == DeliveryEarningStatus.PENDING
    assert earning.earned_at is None


@pytest.mark.django_db
def test_completion_does_not_overwrite_non_pending_earning(
    earning_completion_order,
    earning_completion_agent,
    patient,
):
    earning = DeliveryEarning.objects.get(
        order=earning_completion_order,
    )
    earning.status = DeliveryEarningStatus.PAID
    earning.save(
        update_fields=(
            "status",
            "updated_at",
        )
    )

    issued = issue_delivery_pin(
        order_id=earning_completion_order.id,
        customer=patient,
    )

    complete_delivery(
        order_id=earning_completion_order.id,
        agent=earning_completion_agent,
        pin=issued["pin"],
        latitude=33.5731,
        longitude=-7.5898,
        cash_confirmed=True,
    )

    earning.refresh_from_db()

    assert earning.status == DeliveryEarningStatus.PAID
    assert earning.earned_at is None
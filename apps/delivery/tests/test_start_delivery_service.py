from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point
from rest_framework.exceptions import ValidationError

from apps.core.constants import UserRole
from apps.delivery.services.start_delivery import start_delivery
from apps.orders.constants import OrderStatus, PaymentMethod
from apps.orders.models import Order, OrderStatusHistory


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
def start_delivery_agent(db):
    return _create_delivery_agent(
        phone="+212600730001",
        email="start.delivery.agent@example.com",
        cin="SD123451",
        first_name="StartDelivery",
    )


@pytest.fixture
def other_start_delivery_agent(db):
    return _create_delivery_agent(
        phone="+212600730002",
        email="start.delivery.other@example.com",
        cin="SD123452",
        first_name="OtherStart",
    )


@pytest.fixture
def picked_up_order(patient, pharmacy, start_delivery_agent):
    return Order.objects.create(
        customer=patient,
        pharmacy=pharmacy,
        delivery_agent=start_delivery_agent,
        delivery_address="Maarif, Casablanca",
        delivery_location=Point(
            -7.6320,
            33.5860,
            srid=4326,
        ),
        items_total=Decimal("50.00"),
        delivery_fee=Decimal("15.00"),
        grand_total=Decimal("65.00"),
        status=OrderStatus.PICKED_UP,
        payment_method=PaymentMethod.CASH,
    )


@pytest.mark.django_db
def test_assigned_agent_can_start_delivery(
    picked_up_order,
    start_delivery_agent,
):
    order = start_delivery(
        order_id=picked_up_order.id,
        agent=start_delivery_agent,
    )

    order.refresh_from_db()

    assert order.status == OrderStatus.OUT_FOR_DELIVERY

    history = OrderStatusHistory.objects.filter(
        order=order,
        status=OrderStatus.OUT_FOR_DELIVERY,
    ).latest("created_at")

    assert history.changed_by_id == start_delivery_agent.id
    assert history.note == "Delivery started by delivery agent."


@pytest.mark.django_db
def test_delivery_cannot_start_before_pickup(
    picked_up_order,
    start_delivery_agent,
):
    picked_up_order.status = OrderStatus.AWAITING_AGENT
    picked_up_order.save(
        update_fields=(
            "status",
            "updated_at",
        )
    )

    with pytest.raises(
        ValidationError,
        match="Delivery can only be started after pickup verification",
    ):
        start_delivery(
            order_id=picked_up_order.id,
            agent=start_delivery_agent,
        )

    picked_up_order.refresh_from_db()
    assert picked_up_order.status == OrderStatus.AWAITING_AGENT


@pytest.mark.django_db
def test_wrong_agent_cannot_start_delivery(
    picked_up_order,
    other_start_delivery_agent,
):
    with pytest.raises(
        ValidationError,
        match="You are not the assigned delivery agent",
    ):
        start_delivery(
            order_id=picked_up_order.id,
            agent=other_start_delivery_agent,
        )

    picked_up_order.refresh_from_db()
    assert picked_up_order.status == OrderStatus.PICKED_UP
from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point
from django.utils import timezone

from apps.core.constants import UserRole
from apps.delivery.models import DeliveryAgentProfile, DeliveryOffer
from apps.delivery.services.offers import accept_offer
from apps.notifications.constants import NotificationType
from apps.notifications.models import Notification
from apps.orders.constants import OrderStatus, PaymentMethod
from apps.orders.models import Order


User = get_user_model()


def _create_order(*, patient, pharmacy, status):
    order = Order.objects.create(
        customer=patient,
        pharmacy=pharmacy,
        delivery_address="Maarif, Casablanca",
        delivery_location=Point(-7.6320, 33.5860, srid=4326),
        items_total=Decimal("50.00"),
        delivery_fee=Decimal("15.00"),
        grand_total=Decimal("65.00"),
        status=status,
        payment_method=PaymentMethod.CASH,
    )
    Notification.objects.filter(user=patient).delete()
    return order


def _create_agent():
    return User.objects.create_user(
        phone="+212600861001",
        password="StrongPass123!",
        email="patient.step6.agent@example.com",
        cin="PN861001",
        first_name="StepSix",
        last_name="Livreur",
        date_of_birth=date(1993, 1, 1),
        gender="M",
        role=UserRole.DELIVERY,
        is_phone_verified=True,
    )


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("next_status", "expected_type"),
    [
        (OrderStatus.AWAITING_AGENT, NotificationType.ORDER_STATUS_CHANGED),
        (OrderStatus.PICKED_UP, NotificationType.ORDER_STATUS_CHANGED),
        (OrderStatus.OUT_FOR_DELIVERY, NotificationType.ORDER_STATUS_CHANGED),
        (OrderStatus.DELIVERED, NotificationType.ORDER_DELIVERED),
        (OrderStatus.FAILED, NotificationType.ORDER_STATUS_CHANGED),
    ],
)
def test_patient_receives_delivery_lifecycle_status_notifications(
    patient,
    pharmacy,
    next_status,
    expected_type,
):
    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        status=OrderStatus.READY_FOR_PICKUP,
    )

    order.status = next_status
    order.save(update_fields=("status", "updated_at"))

    notification = Notification.objects.get(user=patient)

    assert notification.type == expected_type
    assert notification.payload["order_id"] == order.id
    assert notification.payload["status"] == next_status


@pytest.mark.django_db
def test_patient_receives_notification_when_courier_accepts_assignment(
    patient,
    pharmacy,
):
    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        status=OrderStatus.AWAITING_AGENT,
    )
    agent = _create_agent()
    now = timezone.now()

    DeliveryAgentProfile.objects.create(
        user=agent,
        approved_at=now,
        is_online=True,
        current_location=Point(-7.6200, 33.5800, srid=4326),
        location_updated_at=now,
    )
    offer = DeliveryOffer.objects.create(
        order=order,
        agent=agent,
        expires_at=now + timedelta(minutes=5),
        earning_amount=Decimal("15.00"),
    )

    accepted = accept_offer(
        offer_id=offer.id,
        agent=agent,
    )

    order.refresh_from_db()
    notification = Notification.objects.get(
        user=patient,
        type=NotificationType.AGENT_ASSIGNED,
    )

    assert accepted.id == offer.id
    assert order.delivery_agent_id == agent.id
    assert notification.payload["order_id"] == order.id
    assert notification.payload["agent_name"] == agent.full_name

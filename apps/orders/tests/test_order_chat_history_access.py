from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point
from rest_framework.test import APIClient

from apps.core.constants import UserRole
from apps.orders.constants import OrderStatus, PaymentMethod
from apps.orders.models import ChatMessage, Order


User = get_user_model()


def _create_agent(*, phone: str, cin: str):
    return User.objects.create_user(
        phone=phone,
        password="StrongPass123!",
        email=f"{cin.lower()}@example.com",
        cin=cin,
        first_name="Chat",
        last_name="Livreur",
        date_of_birth=date(1992, 1, 1),
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
        status=OrderStatus.OUT_FOR_DELIVERY,
        payment_method=PaymentMethod.CASH,
    )


@pytest.mark.django_db
def test_patient_and_assigned_agent_can_read_same_chat_history(
    patient,
    pharmacy,
):
    agent = _create_agent(
        phone="+212600853001",
        cin="CH853001",
    )
    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=agent,
    )
    message = ChatMessage.objects.create(
        order=order,
        sender=patient,
        content="Je suis devant l'immeuble.",
    )

    client = APIClient()

    client.force_authenticate(user=patient)
    patient_response = client.get(
        f"/api/v1/orders/{order.id}/messages/",
    )

    client.force_authenticate(user=agent)
    agent_response = client.get(
        f"/api/v1/orders/{order.id}/messages/",
    )

    assert patient_response.status_code == 200
    assert agent_response.status_code == 200

    for response in (patient_response, agent_response):
        assert len(response.data) == 1
        assert response.data[0]["id"] == message.id
        assert response.data[0]["sender"] == patient.id
        assert response.data[0]["content"] == "Je suis devant l'immeuble."


@pytest.mark.django_db
def test_pharmacist_cannot_read_customer_courier_chat(
    patient,
    pharmacy,
    pharmacist,
):
    agent = _create_agent(
        phone="+212600853002",
        cin="CH853002",
    )
    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=agent,
    )
    ChatMessage.objects.create(
        order=order,
        sender=agent,
        content="J'arrive dans quelques minutes.",
    )

    client = APIClient()
    client.force_authenticate(user=pharmacist)

    response = client.get(
        f"/api/v1/orders/{order.id}/messages/",
    )

    assert response.status_code == 403


@pytest.mark.django_db
def test_unrelated_delivery_agent_cannot_read_chat_history(
    patient,
    pharmacy,
):
    assigned_agent = _create_agent(
        phone="+212600853003",
        cin="CH853003",
    )
    unrelated_agent = _create_agent(
        phone="+212600853004",
        cin="CH853004",
    )
    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=assigned_agent,
    )

    client = APIClient()
    client.force_authenticate(user=unrelated_agent)

    response = client.get(
        f"/api/v1/orders/{order.id}/messages/",
    )

    assert response.status_code == 404

from datetime import date
from decimal import Decimal

import pytest
from asgiref.sync import async_to_sync
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point

from apps.core.constants import UserRole
from apps.orders.constants import OrderStatus, PaymentMethod
from apps.orders.models import ChatMessage, Order
from apps.tracking.consumers import OrderChatConsumer


User = get_user_model()


def _create_agent():
    return User.objects.create_user(
        phone="+212600854001",
        password="StrongPass123!",
        email="chat.agent@example.com",
        cin="CH854001",
        first_name="Realtime",
        last_name="Livreur",
        date_of_birth=date(1991, 1, 1),
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


def _communicator(order_id: int, user):
    communicator = WebsocketCommunicator(
        OrderChatConsumer.as_asgi(),
        f"/ws/orders/{order_id}/chat/",
    )
    communicator.scope["user"] = user
    communicator.scope["url_route"] = {
        "kwargs": {
            "order_id": str(order_id),
        },
    }
    return communicator


async def _roundtrip(order_id, patient, agent):
    patient_socket = _communicator(
        order_id,
        patient,
    )
    agent_socket = _communicator(
        order_id,
        agent,
    )

    patient_connected, _ = await patient_socket.connect()
    agent_connected, _ = await agent_socket.connect()

    assert patient_connected is True
    assert agent_connected is True

    await patient_socket.send_json_to({
        "content": "Bonjour, je suis disponible.",
    })

    patient_payload = await patient_socket.receive_json_from()
    agent_payload = await agent_socket.receive_json_from()

    assert patient_payload == agent_payload
    assert patient_payload["type"] == "message"
    assert patient_payload["order_id"] == order_id
    assert patient_payload["sender_id"] == patient.id
    assert patient_payload["content"] == "Bonjour, je suis disponible."
    assert isinstance(patient_payload["id"], int)
    assert isinstance(patient_payload["created_at"], str)

    await patient_socket.disconnect()
    await agent_socket.disconnect()

    return patient_payload


@pytest.mark.django_db(transaction=True)
def test_customer_message_is_persisted_and_broadcast_to_assigned_agent(
    patient,
    pharmacy,
):
    agent = _create_agent()
    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=agent,
    )

    payload = async_to_sync(_roundtrip)(
        order.id,
        patient,
        agent,
    )

    message = ChatMessage.objects.get(
        pk=payload["id"],
    )

    assert message.order_id == order.id
    assert message.sender_id == patient.id
    assert message.content == "Bonjour, je suis disponible."


async def _pharmacist_rejected(order_id, pharmacist):
    socket = _communicator(
        order_id,
        pharmacist,
    )

    connected, close_code = await socket.connect()

    assert connected is False
    assert close_code == 4403


@pytest.mark.django_db(transaction=True)
def test_pharmacist_is_rejected_from_order_chat_websocket(
    patient,
    pharmacy,
    pharmacist,
):
    agent = _create_agent()
    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=agent,
    )

    async_to_sync(_pharmacist_rejected)(
        order.id,
        pharmacist,
    )

from types import SimpleNamespace

import pytest
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from channels.testing import WebsocketCommunicator
from django.contrib.auth.models import AnonymousUser

from apps.tracking.consumers import (
    DeliveryEventsConsumer,
    _delivery_events_group,
)


async def _delivery_agent_can_connect():
    user = SimpleNamespace(
        id=101,
        is_authenticated=True,
        is_delivery=True,
    )

    communicator = WebsocketCommunicator(
        DeliveryEventsConsumer.as_asgi(),
        "/ws/delivery/events/",
    )
    communicator.scope["user"] = user

    connected, _ = await communicator.connect()

    assert connected is True

    payload = await communicator.receive_json_from()

    assert payload == {
        "type": "connected",
    }

    await communicator.disconnect()


@pytest.mark.django_db(transaction=True)
def test_delivery_agent_can_connect_to_events_socket():
    async_to_sync(_delivery_agent_can_connect)()


async def _non_delivery_user_is_rejected():
    user = SimpleNamespace(
        id=202,
        is_authenticated=True,
        is_delivery=False,
    )

    communicator = WebsocketCommunicator(
        DeliveryEventsConsumer.as_asgi(),
        "/ws/delivery/events/",
    )
    communicator.scope["user"] = user

    connected, close_code = await communicator.connect()

    assert connected is False
    assert close_code == 4403


def test_non_delivery_user_is_rejected():
    async_to_sync(_non_delivery_user_is_rejected)()


async def _anonymous_user_is_rejected():
    communicator = WebsocketCommunicator(
        DeliveryEventsConsumer.as_asgi(),
        "/ws/delivery/events/",
    )
    communicator.scope["user"] = AnonymousUser()

    connected, close_code = await communicator.connect()

    assert connected is False
    assert close_code == 4401


def test_anonymous_user_is_rejected():
    async_to_sync(_anonymous_user_is_rejected)()


async def _offer_available_event_sends_minimal_payload():
    user = SimpleNamespace(
        id=303,
        is_authenticated=True,
        is_delivery=True,
    )

    communicator = WebsocketCommunicator(
        DeliveryEventsConsumer.as_asgi(),
        "/ws/delivery/events/",
    )
    communicator.scope["user"] = user

    connected, _ = await communicator.connect()
    assert connected is True

    connected_payload = await communicator.receive_json_from()

    assert connected_payload == {
        "type": "connected",
    }

    channel_layer = get_channel_layer()

    await channel_layer.group_send(
        _delivery_events_group(user.id),
        {
            "type": "delivery_offer_available",
            "offer_id": 77,
        },
    )

    payload = await communicator.receive_json_from()

    assert payload == {
        "type": "offer_available",
        "offer_id": 77,
    }

    await communicator.disconnect()


@pytest.mark.django_db(transaction=True)
def test_offer_available_event_sends_minimal_payload():
    async_to_sync(_offer_available_event_sends_minimal_payload)()
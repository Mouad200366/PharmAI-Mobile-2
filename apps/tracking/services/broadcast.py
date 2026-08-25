"""Server-side push helpers for websocket groups.

Imports are deferred so this module remains safe to import when Channels uses
an in-memory layer during tests.
"""


def _send(group: str, message: dict):
    from asgiref.sync import async_to_sync
    from channels.layers import get_channel_layer

    layer = get_channel_layer()
    if layer is None:
        return

    async_to_sync(layer.group_send)(
        group,
        message,
    )


def broadcast_order_status_change(order):
    """Push a status update to every consumer in ``order_{id}``."""
    _send(
        f'order_{order.id}',
        {
            'type': 'order_status_change',
            'status': order.status,
        },
    )


def broadcast_location_update(order_id: int, payload: dict):
    """Push an agent-location update to an order tracking group."""
    _send(
        f'order_{order_id}',
        {
            'type': 'location_update',
            'payload': payload,
        },
    )


def broadcast_delivery_offer_available(*, agent_id: int, offer_id: int):
    """Tell one delivery agent that a new offer is ready to refetch."""
    _send(
        f'delivery_events_{agent_id}',
        {
            'type': 'delivery_offer_available',
            'offer_id': offer_id,
        },
    )


def broadcast_delivery_offer_expired(*, agent_id: int, offer_id: int):
    """Tell one delivery agent that an offer has expired."""
    _send(
        f'delivery_events_{agent_id}',
        {
            'type': 'delivery_offer_expired',
            'offer_id': offer_id,
        },
    )


def broadcast_delivery_offer_cancelled(*, agent_id: int, offer_id: int):
    """Tell one delivery agent that an offer is no longer available."""
    _send(
        f'delivery_events_{agent_id}',
        {
            'type': 'delivery_offer_cancelled',
            'offer_id': offer_id,
        },
    )


def broadcast_delivery_assignment_updated(*, agent_id: int, order_id: int):
    """Tell one delivery agent to refetch their active assignment state."""
    _send(
        f'delivery_events_{agent_id}',
        {
            'type': 'delivery_assignment_updated',
            'order_id': order_id,
        },
    )
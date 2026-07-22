"""Server-side push helpers for the tracking websocket groups.

Imports are deferred so this module is safe to import even when Channels
isn't configured (e.g. during unit tests with in-memory channel layer).
"""


def _send(group: str, message: dict):
    from asgiref.sync import async_to_sync
    from channels.layers import get_channel_layer

    layer = get_channel_layer()
    if layer is None:
        return  # CHANNEL_LAYERS not configured — silently drop
    async_to_sync(layer.group_send)(group, message)


def broadcast_order_status_change(order):
    """Push a status update to every consumer in `order_{id}`.

    Hook this from `state_machine.transition` (via Django signal) so any
    backend status change automatically reaches subscribed clients.
    """
    _send(
        f'order_{order.id}',
        {'type': 'order_status_change', 'status': order.status},
    )


def broadcast_location_update(order_id: int, payload: dict):
    """Used by the agent location consumer to push to the order group."""
    _send(
        f'order_{order_id}',
        {'type': 'location_update', 'payload': payload},
    )

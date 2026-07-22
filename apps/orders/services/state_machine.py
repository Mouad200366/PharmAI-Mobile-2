from rest_framework.exceptions import ValidationError

from ..constants import OrderStatus

# Allowed transitions. Keys = current status; values = set of permitted next statuses.
# Roles enforced separately by views/permissions.
TRANSITIONS: dict[str, set[str]] = {
    OrderStatus.PENDING_PAYMENT: {
        # Webhook moves card orders forward (or cancels on failure).
        OrderStatus.PENDING_REVIEW, OrderStatus.ACCEPTED, OrderStatus.CANCELLED,
    },
    OrderStatus.PENDING_REVIEW: {
        OrderStatus.ACCEPTED, OrderStatus.REJECTED, OrderStatus.CANCELLED,
    },
    OrderStatus.ACCEPTED: {
        OrderStatus.PREPARING, OrderStatus.CANCELLED,
    },
    OrderStatus.PREPARING: {
        OrderStatus.READY_FOR_PICKUP, OrderStatus.CANCELLED,
    },
    OrderStatus.READY_FOR_PICKUP: {
        OrderStatus.AWAITING_AGENT, OrderStatus.CANCELLED,
    },
    OrderStatus.AWAITING_AGENT: {
        OrderStatus.PICKED_UP, OrderStatus.CANCELLED, OrderStatus.FAILED,
    },
    OrderStatus.PICKED_UP: {
        OrderStatus.OUT_FOR_DELIVERY,
    },
    OrderStatus.OUT_FOR_DELIVERY: {
        OrderStatus.DELIVERED, OrderStatus.FAILED,
    },
    # Terminal states — no outbound transitions.
    OrderStatus.DELIVERED: set(),
    OrderStatus.REJECTED: set(),
    OrderStatus.CANCELLED: set(),
    OrderStatus.FAILED: set(),
}

# Statuses where an agent is actively engaged with an order.
ACTIVE_AGENT_STATUSES = (
    OrderStatus.AWAITING_AGENT,
    OrderStatus.PICKED_UP,
    OrderStatus.OUT_FOR_DELIVERY,
)


def can_transition(order, new_status: str) -> bool:
    return new_status in TRANSITIONS.get(order.status, set())


def transition(order, new_status: str, *, by_user=None, save: bool = True):
    """Centralised state change. Raises ValidationError if not allowed."""
    if not can_transition(order, new_status):
        raise ValidationError(
            f'Cannot move order from {order.status} to {new_status}.',
        )
    order.status = new_status
    if save:
        order.save(update_fields=('status', 'updated_at'))
    return order

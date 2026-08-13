from django.db import transaction
from rest_framework.exceptions import ValidationError

from ..constants import OrderStatus
from ..models import OrderStatusHistory

# Allowed transitions. Keys = current status; values = set of permitted next statuses.
# Roles are enforced separately by views and permissions.
TRANSITIONS: dict[str, set[str]] = {
    OrderStatus.PENDING_PAYMENT: {
        # A payment webhook moves card orders forward, or cancels them on failure.
        OrderStatus.PENDING_REVIEW,
        OrderStatus.ACCEPTED,
        OrderStatus.CANCELLED,
    },
    OrderStatus.PENDING_REVIEW: {
        OrderStatus.ACCEPTED,
        OrderStatus.REJECTED,
        OrderStatus.CANCELLED,
    },
    OrderStatus.ACCEPTED: {
        OrderStatus.PREPARING,
        OrderStatus.CANCELLED,
    },
    OrderStatus.PREPARING: {
        OrderStatus.READY_FOR_PICKUP,
        OrderStatus.CANCELLED,
    },
    OrderStatus.READY_FOR_PICKUP: {
        OrderStatus.AWAITING_AGENT,
        OrderStatus.CANCELLED,
    },
    OrderStatus.AWAITING_AGENT: {
        OrderStatus.PICKED_UP,
        OrderStatus.CANCELLED,
        OrderStatus.FAILED,
    },
    OrderStatus.PICKED_UP: {
        OrderStatus.OUT_FOR_DELIVERY,
    },
    OrderStatus.OUT_FOR_DELIVERY: {
        OrderStatus.DELIVERED,
        OrderStatus.FAILED,
    },
    # Terminal states — no outbound transitions.
    OrderStatus.DELIVERED: set(),
    OrderStatus.REJECTED: set(),
    OrderStatus.CANCELLED: set(),
    OrderStatus.FAILED: set(),
}

# Statuses where a delivery agent is actively engaged with an order.
ACTIVE_AGENT_STATUSES = (
    OrderStatus.AWAITING_AGENT,
    OrderStatus.PICKED_UP,
    OrderStatus.OUT_FOR_DELIVERY,
)


def can_transition(order, new_status: str) -> bool:
    return new_status in TRANSITIONS.get(order.status, set())


def _authenticated_user_or_none(user):
    """Return a valid authenticated user for the history record, or ``None``.

    Some status changes are performed automatically by a webhook or a
    background service. In those cases there is intentionally no user to save.
    """

    if user is None:
        return None

    is_authenticated = getattr(user, 'is_authenticated', True)
    return user if is_authenticated else None


def transition(
    order,
    new_status: str,
    *,
    by_user=None,
    note: str = '',
    save: bool = True,
):
    """Move an order to an allowed status and record the transition.

    The order update and its history entry are written in the same database
    transaction, so they cannot become inconsistent. ``save=False`` preserves
    the previous helper behaviour for callers and unit tests that only need to
    mutate the in-memory object.
    """

    if not can_transition(order, new_status):
        raise ValidationError(
            f'Cannot move order from {order.status} to {new_status}.',
        )

    order.status = new_status

    if not save:
        return order

    # Lightweight unit-test stand-ins may not be saved Django model instances.
    # Keep the original behaviour for them without attempting a database write.
    if getattr(order, 'pk', None) is None:
        order.save(update_fields=('status', 'updated_at'))
        return order

    with transaction.atomic():
        order.save(update_fields=('status', 'updated_at'))
        OrderStatusHistory.objects.create(
            order=order,
            status=new_status,
            changed_by=_authenticated_user_or_none(by_user),
            note=note.strip(),
        )

    return order
from celery import shared_task

from .constants import OrderStatus
from .models import Order


@shared_task
def retry_stuck_orders():
    """Re-run agent assignment for orders that are accepted/awaiting an agent
    but never got one (e.g. no agent was online when they were placed)."""
    from .services.place_order import _try_assign_agent

    candidates = Order.objects.filter(
        status__in=(OrderStatus.ACCEPTED, OrderStatus.READY_FOR_PICKUP, OrderStatus.AWAITING_AGENT),
        delivery_agent__isnull=True,
    ).select_related('pharmacy')

    assigned = 0
    for order in candidates:
        before = order.delivery_agent_id
        _try_assign_agent(order)
        if order.delivery_agent_id and order.delivery_agent_id != before:
            assigned += 1
    return {'considered': len(candidates), 'assigned': assigned}

from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.delivery.services.incident_guards import (
    ensure_no_unresolved_delivery_incident,
)
from apps.orders.constants import OrderStatus
from apps.orders.models import Order
from apps.orders.services.state_machine import transition


def start_delivery(*, order_id, agent):
    """Start the customer-delivery leg for an already picked-up order."""
    with transaction.atomic():
        order = (
            Order.objects
            .select_for_update()
            .filter(pk=order_id)
            .first()
        )

        if order is None:
            raise ValidationError(
                'Order not found.',
            )

        if order.delivery_agent_id != agent.id:
            raise ValidationError(
                'You are not the assigned delivery agent for this order.',
            )

        if order.status != OrderStatus.PICKED_UP:
            raise ValidationError(
                'Delivery can only be started after pickup verification.',
            )

        ensure_no_unresolved_delivery_incident(
            order=order,
        )

        transition(
            order,
            OrderStatus.OUT_FOR_DELIVERY,
            by_user=agent,
            note='Delivery started by delivery agent.',
        )

    return order
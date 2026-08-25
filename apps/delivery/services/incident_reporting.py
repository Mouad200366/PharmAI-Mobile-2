from django.db import transaction
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.delivery.models import (
    DeliveryIncident,
    DeliveryIncidentReason,
    DeliveryIncidentStatus,
)
from apps.orders.constants import OrderStatus
from apps.orders.models import Order


REPORTABLE_ORDER_STATUSES = (
    OrderStatus.AWAITING_AGENT,
    OrderStatus.PICKED_UP,
    OrderStatus.OUT_FOR_DELIVERY,
)

ACTIVE_INCIDENT_STATUSES = (
    DeliveryIncidentStatus.OPEN,
    DeliveryIncidentStatus.RETURN_REQUIRED,
    DeliveryIncidentStatus.RETURNING,
    DeliveryIncidentStatus.RETURNED,
)


def report_delivery_incident(
    *,
    order_id,
    agent,
    reason,
    details="",
):
    valid_reasons = {
        choice.value
        for choice in DeliveryIncidentReason
    }

    if reason not in valid_reasons:
        raise ValidationError(
            "Invalid delivery incident reason.",
        )

    with transaction.atomic():
        order = (
            Order.objects
            .select_for_update()
            .filter(pk=order_id)
            .first()
        )

        if order is None:
            raise ValidationError(
                "Order not found.",
            )

        if order.delivery_agent_id != agent.id:
            raise PermissionDenied(
                "You are not the assigned delivery agent for this order.",
            )

        if order.status not in REPORTABLE_ORDER_STATUSES:
            raise ValidationError(
                "A delivery incident cannot be reported at this order stage.",
            )

        active_incident_exists = (
            DeliveryIncident.objects
            .select_for_update()
            .filter(
                order=order,
                status__in=ACTIVE_INCIDENT_STATUSES,
            )
            .exists()
        )

        if active_incident_exists:
            raise ValidationError(
                "This order already has an unresolved delivery incident.",
            )

        incident = DeliveryIncident.objects.create(
            order=order,
            agent=agent,
            reason=reason,
            status=DeliveryIncidentStatus.OPEN,
            reported_order_status=order.status,
            details=(details or "").strip(),
        )

    return incident
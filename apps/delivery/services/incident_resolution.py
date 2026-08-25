from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.delivery.models import (
    DeliveryEarning,
    DeliveryEarningStatus,
    DeliveryIncident,
    DeliveryIncidentStatus,
    DeliveryOffer,
    DeliveryOfferStatus,
)
from apps.orders.constants import OrderStatus
from apps.tracking.services.broadcast import (
    broadcast_delivery_assignment_updated,
)


def _get_locked_incident(*, incident_id):
    incident = (
        DeliveryIncident.objects
        .select_for_update()
        .select_related("order")
        .filter(pk=incident_id)
        .first()
    )

    if incident is None:
        raise ValidationError(
            "Delivery incident not found.",
        )

    return incident


def resolve_incident_continue(
    *,
    incident_id,
    resolution_note="",
):
    with transaction.atomic():
        incident = _get_locked_incident(
            incident_id=incident_id,
        )

        if incident.status != DeliveryIncidentStatus.OPEN:
            raise ValidationError(
                "Only an open delivery incident can be resolved to continue.",
            )

        incident.status = DeliveryIncidentStatus.RESOLVED_CONTINUE
        incident.resolution_note = (resolution_note or "").strip()
        incident.resolved_at = timezone.now()
        incident.save(
            update_fields=(
                "status",
                "resolution_note",
                "resolved_at",
                "updated_at",
            ),
        )

    return incident


def require_incident_return(
    *,
    incident_id,
    resolution_note="",
):
    with transaction.atomic():
        incident = _get_locked_incident(
            incident_id=incident_id,
        )

        if incident.status != DeliveryIncidentStatus.OPEN:
            raise ValidationError(
                "Only an open delivery incident can require a return.",
            )

        incident.status = DeliveryIncidentStatus.RETURN_REQUIRED
        incident.resolution_note = (resolution_note or "").strip()
        incident.resolved_at = None
        incident.save(
            update_fields=(
                "status",
                "resolution_note",
                "resolved_at",
                "updated_at",
            ),
        )

    return incident


def start_incident_return(
    *,
    incident_id,
    agent,
):
    with transaction.atomic():
        incident = _get_locked_incident(
            incident_id=incident_id,
        )

        if incident.agent_id != agent.id:
            raise PermissionDenied(
                "You are not the assigned delivery agent for this incident.",
            )

        if incident.status != DeliveryIncidentStatus.RETURN_REQUIRED:
            raise ValidationError(
                "This delivery incident is not ready to start a return.",
            )

        incident.status = DeliveryIncidentStatus.RETURNING
        incident.save(
            update_fields=(
                "status",
                "updated_at",
            ),
        )

    return incident


def release_pre_pickup_incident(
    *,
    incident_id,
    resolution_note="",
):
    """Release an assigned courier before pickup and redispatch the order."""
    redispatch_order = None
    released_agent_id = None

    with transaction.atomic():
        incident = _get_locked_incident(
            incident_id=incident_id,
        )
        order = incident.order

        if incident.status != DeliveryIncidentStatus.OPEN:
            raise ValidationError(
                "Only an open delivery incident can release a courier.",
            )

        if incident.reported_order_status != OrderStatus.AWAITING_AGENT:
            raise ValidationError(
                "Only a pre-pickup delivery incident can release a courier.",
            )

        if order.status != OrderStatus.AWAITING_AGENT:
            raise ValidationError(
                "This order is no longer awaiting pickup.",
            )

        if order.delivery_agent_id != incident.agent_id:
            raise ValidationError(
                "The incident agent is not the order's assigned delivery agent.",
            )

        accepted_offer = (
            DeliveryOffer.objects
            .select_for_update()
            .filter(
                order=order,
                agent_id=incident.agent_id,
                status=DeliveryOfferStatus.ACCEPTED,
            )
            .first()
        )

        if accepted_offer is None:
            raise ValidationError(
                "The accepted delivery offer for this assignment was not found.",
            )

        earning = (
            DeliveryEarning.objects
            .select_for_update()
            .filter(order=order)
            .first()
        )

        if (
            earning is not None
            and earning.status != DeliveryEarningStatus.PENDING
        ):
            raise ValidationError(
                "The delivery earning cannot be cancelled at this stage.",
            )

        now = timezone.now()

        accepted_offer.status = DeliveryOfferStatus.CANCELLED
        accepted_offer.responded_at = now
        accepted_offer.save(
            update_fields=(
                "status",
                "responded_at",
                "updated_at",
            ),
        )

        if earning is not None:
            earning.status = DeliveryEarningStatus.CANCELLED
            earning.save(
                update_fields=(
                    "status",
                    "updated_at",
                ),
            )

        released_agent_id = incident.agent_id

        order.delivery_agent = None
        order.save(
            update_fields=(
                "delivery_agent",
                "updated_at",
            ),
        )

        incident.status = DeliveryIncidentStatus.RESOLVED
        incident.resolution_note = (resolution_note or "").strip()
        incident.resolved_at = now
        incident.save(
            update_fields=(
                "status",
                "resolution_note",
                "resolved_at",
                "updated_at",
            ),
        )

        redispatch_order = order

    if released_agent_id is not None:
        broadcast_delivery_assignment_updated(
            agent_id=released_agent_id,
            order_id=redispatch_order.id,
        )

    if redispatch_order is not None:
        from apps.delivery.services.offers import _redispatch

        _redispatch(redispatch_order)

    return incident


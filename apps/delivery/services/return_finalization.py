from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.delivery.models import (
    AgentCashTransaction,
    AgentCashTransactionType,
    DeliveryEarning,
    DeliveryEarningStatus,
    DeliveryIncident,
    DeliveryIncidentStatus,
    DeliveryVerification,
    DeliveryVerificationType,
)
from apps.orders.constants import OrderStatus
from apps.orders.services.state_machine import transition


FINALIZABLE_RETURN_ORDER_STATUSES = (
    OrderStatus.PICKED_UP,
    OrderStatus.OUT_FOR_DELIVERY,
)


def finalize_verified_return(
    *,
    incident_id,
    resolution_note="",
):
    with transaction.atomic():
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

        if incident.status != DeliveryIncidentStatus.RETURNED:
            raise ValidationError(
                "Only a physically verified returned incident can be finalized.",
            )

        order = (
            incident.order.__class__.objects
            .select_for_update()
            .filter(pk=incident.order_id)
            .first()
        )

        if order is None:
            raise ValidationError(
                "Order not found.",
            )

        if order.status not in FINALIZABLE_RETURN_ORDER_STATUSES:
            raise ValidationError(
                "This order cannot be finalized as a returned delivery.",
            )

        return_verification = (
            DeliveryVerification.objects
            .select_for_update()
            .filter(
                order=order,
                verification_type=DeliveryVerificationType.RETURN,
                used_at__isnull=False,
            )
            .first()
        )

        if return_verification is None:
            raise ValidationError(
                "A successful return verification is required before finalization.",
            )

        cash_collection_exists = (
            AgentCashTransaction.objects
            .select_for_update()
            .filter(
                order=order,
                transaction_type=AgentCashTransactionType.COLLECTION,
            )
            .exists()
        )

        if cash_collection_exists:
            raise ValidationError(
                "COD cash for this order must be reconciled before return finalization.",
            )

        earning = (
            DeliveryEarning.objects
            .select_for_update()
            .filter(order=order)
            .first()
        )

        if earning is not None:
            if earning.status == DeliveryEarningStatus.PENDING:
                earning.status = DeliveryEarningStatus.CANCELLED
                earning.save(
                    update_fields=(
                        "status",
                        "updated_at",
                    ),
                )
            elif earning.status != DeliveryEarningStatus.CANCELLED:
                raise ValidationError(
                    "Courier earning must be financially resolved before return finalization.",
                )

        transition(
            order,
            OrderStatus.FAILED,
            note="Delivery failed after verified return to pharmacy.",
        )

        incident.status = DeliveryIncidentStatus.RESOLVED
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
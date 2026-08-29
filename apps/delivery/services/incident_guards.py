from rest_framework.exceptions import ValidationError

from apps.delivery.models import (
    DeliveryIncident,
    DeliveryIncidentStatus,
)


ACTIVE_DELIVERY_INCIDENT_STATUSES = (
    DeliveryIncidentStatus.OPEN,
    DeliveryIncidentStatus.RETURN_REQUIRED,
    DeliveryIncidentStatus.RETURNING,
    DeliveryIncidentStatus.RETURNED,
)

UNRESOLVED_DELIVERY_INCIDENT_MESSAGE = (
    "This delivery has an unresolved incident. "
    "Resolve the incident before continuing."
)


def has_unresolved_delivery_incident(*, order):
    return DeliveryIncident.objects.filter(
        order=order,
        status__in=ACTIVE_DELIVERY_INCIDENT_STATUSES,
    ).exists()


def ensure_no_unresolved_delivery_incident(*, order):
    if has_unresolved_delivery_incident(order=order):
        raise ValidationError(
            UNRESOLVED_DELIVERY_INCIDENT_MESSAGE,
        )

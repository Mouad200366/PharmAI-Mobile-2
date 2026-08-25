from rest_framework import permissions, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.constants import UserRole
from apps.delivery.incident_serializers import (
    DeliveryIncidentReportSerializer,
    DeliveryIncidentSerializer,
    DeliveryReturnVerificationSerializer,
)
from apps.delivery.models import (
    DeliveryIncident,
    DeliveryIncidentStatus,
)
from apps.delivery.services.incident_reporting import report_delivery_incident
from apps.delivery.services.incident_resolution import start_incident_return
from apps.delivery.services.return_verification import verify_delivery_return


ACTIVE_INCIDENT_STATUSES = (
    DeliveryIncidentStatus.OPEN,
    DeliveryIncidentStatus.RETURN_REQUIRED,
    DeliveryIncidentStatus.RETURNING,
    DeliveryIncidentStatus.RETURNED,
)


class _DeliveryIncidentMixin:
    permission_classes = (
        permissions.IsAuthenticated,
    )

    def get_agent(self):
        user = self.request.user

        if user.role != UserRole.DELIVERY:
            raise PermissionDenied(
                "Delivery-agent access required.",
            )

        return user


class DeliveryIncidentReportView(_DeliveryIncidentMixin, APIView):
    def post(self, request, order_id):
        serializer = DeliveryIncidentReportSerializer(
            data=request.data,
        )
        serializer.is_valid(
            raise_exception=True,
        )

        incident = report_delivery_incident(
            order_id=order_id,
            agent=self.get_agent(),
            reason=serializer.validated_data["reason"],
            details=serializer.validated_data.get(
                "details",
                "",
            ),
        )

        return Response(
            DeliveryIncidentSerializer(incident).data,
            status=status.HTTP_201_CREATED,
        )


class CurrentDeliveryIncidentView(_DeliveryIncidentMixin, APIView):
    def get(self, request, order_id):
        agent = self.get_agent()

        incident = (
            DeliveryIncident.objects
            .filter(
                order_id=order_id,
                agent=agent,
                status__in=ACTIVE_INCIDENT_STATUSES,
            )
            .order_by(
                "-created_at",
                "-id",
            )
            .first()
        )

        if incident is None:
            return Response(
                {
                    "incident": None,
                },
                status=status.HTTP_200_OK,
            )

        return Response(
            {
                "incident": DeliveryIncidentSerializer(
                    incident,
                ).data,
            },
            status=status.HTTP_200_OK,
        )


class DeliveryIncidentStartReturnView(_DeliveryIncidentMixin, APIView):
    def post(self, request, incident_id):
        incident = start_incident_return(
            incident_id=incident_id,
            agent=self.get_agent(),
        )

        return Response(
            DeliveryIncidentSerializer(incident).data,
            status=status.HTTP_200_OK,
        )


class DeliveryIncidentReturnVerifyView(_DeliveryIncidentMixin, APIView):
    def post(self, request, incident_id):
        serializer = DeliveryReturnVerificationSerializer(
            data=request.data,
        )
        serializer.is_valid(
            raise_exception=True,
        )

        incident = verify_delivery_return(
            incident_id=incident_id,
            agent=self.get_agent(),
            credential=serializer.validated_data["credential"],
            method=serializer.validated_data["method"],
            latitude=serializer.validated_data["latitude"],
            longitude=serializer.validated_data["longitude"],
        )

        return Response(
            DeliveryIncidentSerializer(incident).data,
            status=status.HTTP_200_OK,
        )
from rest_framework import permissions, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.constants import UserRole
from apps.delivery.incident_serializers import (
    DeliveryIncidentResolutionSerializer,
    DeliveryIncidentSerializer,
)
from apps.delivery.services.incident_resolution import (
    release_pre_pickup_incident,
    require_incident_return,
    resolve_incident_continue,
)
from apps.delivery.services.return_credentials import (
    issue_return_verification,
)
from apps.delivery.services.return_finalization import (
    finalize_verified_return,
)


class _DeliveryIncidentControlMixin:
    permission_classes = (
        permissions.IsAuthenticated,
    )

    def require_admin(self):
        user = self.request.user

        if user.role != UserRole.ADMIN:
            raise PermissionDenied(
                "Admin access required.",
            )

        return user


class DeliveryIncidentResolveContinueView(
    _DeliveryIncidentControlMixin,
    APIView,
):
    def post(self, request, incident_id):
        self.require_admin()

        serializer = DeliveryIncidentResolutionSerializer(
            data=request.data,
        )
        serializer.is_valid(
            raise_exception=True,
        )

        incident = resolve_incident_continue(
            incident_id=incident_id,
            resolution_note=serializer.validated_data.get(
                "resolution_note",
                "",
            ),
        )

        return Response(
            DeliveryIncidentSerializer(incident).data,
            status=status.HTTP_200_OK,
        )


class DeliveryIncidentRequireReturnView(
    _DeliveryIncidentControlMixin,
    APIView,
):
    def post(self, request, incident_id):
        self.require_admin()

        serializer = DeliveryIncidentResolutionSerializer(
            data=request.data,
        )
        serializer.is_valid(
            raise_exception=True,
        )

        incident = require_incident_return(
            incident_id=incident_id,
            resolution_note=serializer.validated_data.get(
                "resolution_note",
                "",
            ),
        )

        return Response(
            DeliveryIncidentSerializer(incident).data,
            status=status.HTTP_200_OK,
        )


class DeliveryIncidentFinalizeReturnView(
    _DeliveryIncidentControlMixin,
    APIView,
):
    def post(self, request, incident_id):
        self.require_admin()

        serializer = DeliveryIncidentResolutionSerializer(
            data=request.data,
        )
        serializer.is_valid(
            raise_exception=True,
        )

        incident = finalize_verified_return(
            incident_id=incident_id,
            resolution_note=serializer.validated_data.get(
                "resolution_note",
                "",
            ),
        )

        return Response(
            DeliveryIncidentSerializer(incident).data,
            status=status.HTTP_200_OK,
        )


class DeliveryIncidentIssueReturnVerificationView(
    _DeliveryIncidentControlMixin,
    APIView,
):
    def post(self, request, incident_id):
        self.require_admin()

        issued = issue_return_verification(
            incident_id=incident_id,
        )

        return Response(
            {
                "pin": issued["pin"],
                "qr_token": issued["qr_token"],
                "expires_at": issued["expires_at"],
            },
            status=status.HTTP_200_OK,
        )


class DeliveryIncidentReleasePrePickupView(
    _DeliveryIncidentControlMixin,
    APIView,
):
    def post(self, request, incident_id):
        self.require_admin()

        serializer = DeliveryIncidentResolutionSerializer(
            data=request.data,
        )
        serializer.is_valid(
            raise_exception=True,
        )

        incident = release_pre_pickup_incident(
            incident_id=incident_id,
            resolution_note=serializer.validated_data.get(
                "resolution_note",
                "",
            ),
        )

        return Response(
            DeliveryIncidentSerializer(incident).data,
            status=status.HTTP_200_OK,
        )


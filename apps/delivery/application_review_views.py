from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.constants import UserRole
from apps.delivery.models import (
    DeliveryApplication,
    DeliveryApplicationStatus,
)
from apps.delivery.serializers import (
    DeliveryApplicationReviewSerializer,
    DeliveryApplicationSerializer,
)
from apps.delivery.services.application_review import (
    approve_delivery_application,
    reject_delivery_application,
)


class _DeliveryApplicationAdminMixin:
    def require_admin(self):
        user = self.request.user

        if not user.is_authenticated or user.role != UserRole.ADMIN:
            raise PermissionDenied(
                "Only an administrator can review delivery applications."
            )


class DeliveryApplicationPendingListView(
    _DeliveryApplicationAdminMixin,
    APIView,
):
    def get(self, request):
        self.require_admin()

        applications = (
            DeliveryApplication.objects
            .select_related('user', 'reviewed_by')
            .filter(status=DeliveryApplicationStatus.PENDING)
            .order_by('submitted_at', 'id')
        )

        return Response(
            {
                'applications': DeliveryApplicationSerializer(
                    applications,
                    many=True,
                ).data,
            }
        )


class DeliveryApplicationDetailView(
    _DeliveryApplicationAdminMixin,
    APIView,
):
    def get(self, request, application_id):
        self.require_admin()

        application = (
            DeliveryApplication.objects
            .select_related('user', 'reviewed_by')
            .filter(pk=application_id)
            .first()
        )

        if application is None:
            from rest_framework.exceptions import NotFound

            raise NotFound('Delivery application not found.')

        return Response(
            DeliveryApplicationSerializer(application).data,
        )


class DeliveryApplicationApproveView(
    _DeliveryApplicationAdminMixin,
    APIView,
):
    def post(self, request, application_id):
        self.require_admin()

        serializer = DeliveryApplicationReviewSerializer(
            data=request.data,
        )
        serializer.is_valid(raise_exception=True)

        application = approve_delivery_application(
            application_id=application_id,
            reviewer=request.user,
            review_note=serializer.validated_data.get(
                "review_note",
                "",
            ),
        )

        return Response(
            DeliveryApplicationSerializer(application).data,
            status=status.HTTP_200_OK,
        )


class DeliveryApplicationRejectView(
    _DeliveryApplicationAdminMixin,
    APIView,
):
    def post(self, request, application_id):
        self.require_admin()

        serializer = DeliveryApplicationReviewSerializer(
            data=request.data,
        )
        serializer.is_valid(raise_exception=True)

        application = reject_delivery_application(
            application_id=application_id,
            reviewer=request.user,
            review_note=serializer.validated_data.get(
                "review_note",
                "",
            ),
        )

        return Response(
            DeliveryApplicationSerializer(application).data,
            status=status.HTTP_200_OK,
        )

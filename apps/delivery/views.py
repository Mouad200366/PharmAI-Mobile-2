from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework import permissions
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    DeliveryAgentProfile,
    DeliveryApplication,
    DeliveryApplicationStatus,
)
from .serializers import (
    DeliveryAgentProfileSerializer,
    DeliveryApplicationSerializer,
    DeliveryOfferSerializer,
    LocationUpdateSerializer,
    OnlineToggleSerializer,
    point_from,
)
from .services.delivery_proof import issue_delivery_pin
from .services.offers import (
    accept_offer,
    decline_offer,
    get_current_offer,
)

User = get_user_model()



class _DeliveryAgentMixin:
    """Resolve the requesting user's delivery profile."""

    permission_classes = (permissions.IsAuthenticated,)

    def get_profile(self, request):
        if not request.user.is_delivery:
            raise PermissionDenied('Delivery accounts only.')

        profile, _ = DeliveryAgentProfile.objects.get_or_create(
            user=request.user,
        )
        return profile


class DeliveryApplicationMeView(APIView):
    """GET/POST the authenticated courier's delivery application."""

    permission_classes = (permissions.IsAuthenticated,)

    def _require_delivery_user(self, request):
        if not request.user.is_delivery:
            raise PermissionDenied('Delivery accounts only.')

    def get(self, request):
        self._require_delivery_user(request)

        application = (
            DeliveryApplication.objects
            .select_related('user', 'reviewed_by')
            .filter(user=request.user)
            .first()
        )

        if application is None:
            return Response({'application': None})

        return Response(
            {
                'application': DeliveryApplicationSerializer(
                    application,
                ).data,
            }
        )

    def post(self, request):
        self._require_delivery_user(request)

        with transaction.atomic():
            locked_user = (
                User.objects
                .select_for_update()
                .get(pk=request.user.pk)
            )

            pending_application = (
                DeliveryApplication.objects
                .filter(
                    user=locked_user,
                    status=DeliveryApplicationStatus.PENDING,
                )
                .order_by('-submitted_at', '-id')
                .first()
            )

            if pending_application is not None:
                application = pending_application
                created = False
            else:
                approved_application = (
                    DeliveryApplication.objects
                    .filter(
                        user=locked_user,
                        status=DeliveryApplicationStatus.APPROVED,
                    )
                    .order_by('-reviewed_at', '-id')
                    .first()
                )

                if approved_application is not None:
                    application = approved_application
                    created = False
                else:
                    application = DeliveryApplication.objects.create(
                        user=locked_user,
                    )
                    created = True

        application = (
            DeliveryApplication.objects
            .select_related('user', 'reviewed_by')
            .get(pk=application.pk)
        )

        return Response(
            {
                'application': DeliveryApplicationSerializer(
                    application,
                ).data,
            },
            status=201 if created else 200,
        )


class OnlineView(_DeliveryAgentMixin, APIView):
    """POST /api/delivery/online/ — toggle online/offline."""

    def post(self, request):
        profile = self.get_profile(request)
        body = OnlineToggleSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data

        if data['is_online'] and not profile.can_work:
            raise PermissionDenied(
                'Your delivery account is not approved or is suspended and cannot go online.',
            )

        if not data['is_online']:
            from apps.orders.models import Order
            from apps.orders.services.state_machine import ACTIVE_AGENT_STATUSES

            has_active_delivery = (
                Order.objects
                .filter(
                    delivery_agent=request.user,
                    status__in=ACTIVE_AGENT_STATUSES,
                )
                .exists()
            )

            if has_active_delivery:
                raise PermissionDenied(
                    'You cannot go offline while you have an active delivery.',
                )

        profile.is_online = data['is_online']

        if data['is_online']:
            profile.current_location = point_from(
                data['latitude'],
                data['longitude'],
            )
            profile.location_updated_at = timezone.now()

        profile.save()

        return Response(
            DeliveryAgentProfileSerializer(profile).data,
        )


class LocationView(_DeliveryAgentMixin, APIView):
    """POST /api/delivery/location/ — push current location."""

    def post(self, request):
        profile = self.get_profile(request)
        body = LocationUpdateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data

        profile.current_location = point_from(
            data['latitude'],
            data['longitude'],
        )
        profile.location_updated_at = timezone.now()
        profile.save(
            update_fields=(
                'current_location',
                'location_updated_at',
                'updated_at',
            )
        )

        return Response(
            DeliveryAgentProfileSerializer(profile).data,
        )


class MeView(_DeliveryAgentMixin, APIView):
    """GET /api/delivery/me/ — current delivery-agent state."""

    def get(self, request):
        profile = self.get_profile(request)

        return Response(
            DeliveryAgentProfileSerializer(profile).data,
        )


class CurrentOfferView(_DeliveryAgentMixin, APIView):
    """GET /api/delivery/offers/current/ — current valid offer."""

    def get(self, request):
        self.get_profile(request)
        offer = get_current_offer(request.user)

        if offer is None:
            return Response({'offer': None})

        return Response(
            {
                'offer': DeliveryOfferSerializer(offer).data,
            }
        )


class OfferAcceptView(_DeliveryAgentMixin, APIView):
    """POST /api/delivery/offers/{id}/accept/ — accept an offer."""

    def post(self, request, offer_id):
        self.get_profile(request)

        offer = accept_offer(
            offer_id=offer_id,
            agent=request.user,
        )

        return Response(
            DeliveryOfferSerializer(offer).data,
        )


class OfferDeclineView(_DeliveryAgentMixin, APIView):
    """POST /api/delivery/offers/{id}/decline/ — decline an offer."""

    def post(self, request, offer_id):
        self.get_profile(request)

        offer = decline_offer(
            offer_id=offer_id,
            agent=request.user,
        )

        return Response(
            DeliveryOfferSerializer(offer).data,
        )


class PatientDeliveryPinIssueView(APIView):
    """POST /api/v1/delivery/orders/{id}/delivery-pin/issue/."""

    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request, order_id):
        issued = issue_delivery_pin(
            order_id=order_id,
            customer=request.user,
        )

        return Response(
            {
                'pin': issued['pin'],
                'expires_at': issued['expires_at'],
            }
        )


from django.utils import timezone
from rest_framework import permissions
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import DeliveryAgentProfile
from .serializers import (
    DeliveryAgentProfileSerializer,
    LocationUpdateSerializer,
    OnlineToggleSerializer,
    point_from,
)


class _DeliveryAgentMixin:
    """Resolves (or creates) the requesting user's `DeliveryAgentProfile`."""

    permission_classes = (permissions.IsAuthenticated,)

    def get_profile(self, request):
        if not request.user.is_delivery:
            raise PermissionDenied('Delivery accounts only.')
        profile, _ = DeliveryAgentProfile.objects.get_or_create(user=request.user)
        return profile


class OnlineView(_DeliveryAgentMixin, APIView):
    """POST /api/delivery/online/  — toggle online/offline (initial location optional)."""

    def post(self, request):
        profile = self.get_profile(request)
        body = OnlineToggleSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        d = body.validated_data
        profile.is_online = d['is_online']
        if d['is_online']:
            profile.current_location = point_from(d['latitude'], d['longitude'])
            profile.location_updated_at = timezone.now()
        profile.save()
        return Response(DeliveryAgentProfileSerializer(profile).data)


class LocationView(_DeliveryAgentMixin, APIView):
    """POST /api/delivery/location/  — push current location."""

    def post(self, request):
        profile = self.get_profile(request)
        body = LocationUpdateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        d = body.validated_data
        profile.current_location = point_from(d['latitude'], d['longitude'])
        profile.location_updated_at = timezone.now()
        profile.save(update_fields=('current_location', 'location_updated_at', 'updated_at'))
        return Response(DeliveryAgentProfileSerializer(profile).data)


class MeView(_DeliveryAgentMixin, APIView):
    """GET /api/delivery/me/  — current state of the requesting agent."""

    def get(self, request):
        profile = self.get_profile(request)
        return Response(DeliveryAgentProfileSerializer(profile).data)

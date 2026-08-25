from django.utils import timezone
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Notification
from .serializers import (
    NotificationSerializer,
    UserDeviceDeactivationSerializer,
    UserDeviceRegistrationSerializer,
    UserDeviceSerializer,
)
from .services import (
    deactivate_user_device,
    register_user_device,
)


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    """List + read user's own notifications. Mark-read happens via custom actions."""

    serializer_class = NotificationSerializer
    permission_classes = (permissions.IsAuthenticated,)
    filterset_fields = ('type',)

    def get_queryset(self):
        qs = Notification.objects.filter(user=self.request.user)
        unread = self.request.query_params.get('unread')
        if unread and unread.lower() in ('1', 'true'):
            qs = qs.filter(read_at__isnull=True)
        return qs

    @action(detail=True, methods=('post',))
    def read(self, request, pk=None):
        notif = self.get_queryset().filter(pk=pk).first()
        if notif is None:
            return Response(status=404)
        if notif.read_at is None:
            notif.read_at = timezone.now()
            notif.save(update_fields=('read_at', 'updated_at'))
        return Response(self.get_serializer(notif).data)

    @action(detail=False, methods=('post',), url_path='read_all')
    def read_all(self, request):
        updated = (
            self.get_queryset()
            .filter(read_at__isnull=True)
            .update(read_at=timezone.now())
        )
        return Response({'marked_read': updated})

    @action(detail=False, methods=('get',))
    def unread_count(self, request):
        count = self.get_queryset().filter(read_at__isnull=True).count()
        return Response({'unread_count': count})


class UserDeviceRegisterView(APIView):
    """Register or refresh the authenticated user's mobile installation."""

    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request):
        serializer = UserDeviceRegistrationSerializer(
            data=request.data,
        )
        serializer.is_valid(raise_exception=True)

        device = register_user_device(
            user=request.user,
            **serializer.validated_data,
        )

        return Response(
            UserDeviceSerializer(device).data,
        )


class UserDeviceDeactivateView(APIView):
    """Deactivate one mobile installation owned by the authenticated user."""

    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request):
        serializer = UserDeviceDeactivationSerializer(
            data=request.data,
        )
        serializer.is_valid(raise_exception=True)

        device = deactivate_user_device(
            user=request.user,
            device_id=serializer.validated_data['device_id'],
        )

        return Response(
            UserDeviceSerializer(device).data,
        )


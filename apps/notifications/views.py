from django.utils import timezone
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Notification
from .serializers import NotificationSerializer


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

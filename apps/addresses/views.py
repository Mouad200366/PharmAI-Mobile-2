from rest_framework import permissions, viewsets

from apps.core.permissions import IsOwner

from .models import Address
from .serializers import AddressSerializer


class AddressViewSet(viewsets.ModelViewSet):
    serializer_class = AddressSerializer
    permission_classes = (permissions.IsAuthenticated, IsOwner)

    def get_queryset(self):
        return Address.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        if serializer.validated_data.get('is_default'):
            Address.objects.filter(
                user=self.request.user, is_default=True,
            ).update(is_default=False)
        serializer.save(user=self.request.user)

    def perform_update(self, serializer):
        if serializer.validated_data.get('is_default'):
            Address.objects.filter(
                user=self.request.user, is_default=True,
            ).exclude(pk=serializer.instance.pk).update(is_default=False)
        serializer.save()

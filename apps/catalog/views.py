from rest_framework import permissions, viewsets

from .models import Medicine
from .serializers import MedicineSerializer


class IsAdminOrReadOnly(permissions.BasePermission):
    """Public reads, staff-only writes. Soft-delete handled by perform_destroy."""

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_authenticated and request.user.is_staff)


class MedicineViewSet(viewsets.ModelViewSet):
    queryset = Medicine.objects.filter(is_active=True)
    serializer_class = MedicineSerializer
    permission_classes = (IsAdminOrReadOnly,)
    filterset_fields = ('requires_prescription',)
    search_fields = ('name', 'generic_name', 'manufacturer')

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=('is_active', 'updated_at'))

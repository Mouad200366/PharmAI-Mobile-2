from django.db.models import (
    Count,
    IntegerField,
    Min,
    Q,
    Sum,
)
from django.db.models.functions import Coalesce
from django_filters.rest_framework import (
    DjangoFilterBackend,
)
from rest_framework import (
    filters,
    permissions,
    viewsets,
)

from .models import Medicine
from .serializers import MedicineSerializer


AVAILABLE_STOCK_FILTER = Q(
    stocks__is_available=True,
    stocks__quantity__gt=0,
    stocks__pharmacy__is_active=True,
    stocks__pharmacy__is_verified=True,
)


class IsAdminOrReadOnly(
    permissions.BasePermission
):
    """
    Allow public reads and restrict writes
    to staff users.
    """

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True

        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.is_staff
        )


class MedicineViewSet(
    viewsets.ModelViewSet
):
    serializer_class = MedicineSerializer
    permission_classes = (
        IsAdminOrReadOnly,
    )

    filter_backends = (
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    )

    filterset_fields = (
        'requires_prescription',
    )

    search_fields = (
        'name',
        'generic_name',
        'manufacturer',
    )

    ordering_fields = (
        'name',
        'min_price',
        'available_pharmacies_count',
    )

    ordering = (
        'name',
    )

    def get_queryset(self):
        return (
            Medicine.objects
            .filter(is_active=True)
            .annotate(
                min_price=Min(
                    'stocks__price',
                    filter=AVAILABLE_STOCK_FILTER,
                ),

                available_pharmacies_count=Count(
                    'stocks__pharmacy',
                    filter=AVAILABLE_STOCK_FILTER,
                    distinct=True,
                ),

                total_available_quantity=Coalesce(
                    Sum(
                        'stocks__quantity',
                        filter=AVAILABLE_STOCK_FILTER,
                    ),
                    0,
                    output_field=IntegerField(),
                ),
            )
        )

    def perform_destroy(self, instance):
        instance.is_active = False

        instance.save(
            update_fields=(
                'is_active',
                'updated_at',
            )
        )
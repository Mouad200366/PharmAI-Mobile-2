from django.contrib.gis.db.models.functions import Distance
from django.contrib.gis.geos import Point
from django.contrib.gis.measure import D
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import NightShift, Pharmacy, PharmacyStock
from .permissions import IsPharmacyOwner
from .serializers import (
    NightShiftSerializer,
    OpenPharmacySerializer,
    PharmacySerializer,
    PharmacyStockSerializer,
)
from .services.availability import is_open_now, open_pharmacies_queryset


class IsAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_staff)


class PharmacyViewSet(viewsets.ModelViewSet):
    """Endpoints
    - POST   /api/pharmacies/        — pharmacist registers (one per account)
    - GET    /api/pharmacies/        — admin only (customers don't browse)
    - GET    /api/pharmacies/{id}/   — admin or the owning pharmacist
    - GET    /api/pharmacies/me/     — pharmacist's own pharmacy
    - PATCH  /api/pharmacies/me/     — update own
    - POST   /api/pharmacies/{id}/verify/ — admin approves
    """

    queryset = Pharmacy.objects.all()
    serializer_class = PharmacySerializer
    permission_classes = (permissions.IsAuthenticated, IsPharmacyOwner)

    def get_queryset(self):
        user = self.request.user
        if user.is_staff:
            return Pharmacy.objects.all()
        if user.is_authenticated and user.is_pharmacist:
            return Pharmacy.objects.filter(owner=user)
        return Pharmacy.objects.none()

    def list(self, request, *args, **kwargs):
        if not request.user.is_staff:
            raise PermissionDenied('Listing pharmacies is restricted to staff.')
        return super().list(request, *args, **kwargs)

    def perform_create(self, serializer):
        if not self.request.user.is_pharmacist:
            raise PermissionDenied('Only pharmacist accounts may create a pharmacy.')
        if Pharmacy.objects.filter(owner=self.request.user).exists():
            raise ValidationError('This account already owns a pharmacy.')
        serializer.save(owner=self.request.user)

    @action(detail=False, methods=('get', 'patch'), url_path='me')
    def me(self, request):
        if not request.user.is_pharmacist:
            raise PermissionDenied('Only pharmacists have a pharmacy profile.')
        try:
            pharmacy = request.user.pharmacy
        except Pharmacy.DoesNotExist as exc:
            raise NotFound('No pharmacy registered for this account.') from exc
        if request.method == 'PATCH':
            serializer = self.get_serializer(pharmacy, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data)
        return Response(self.get_serializer(pharmacy).data)

    @action(detail=True, methods=('post',), permission_classes=(IsAdmin,))
    def verify(self, request, pk=None):
        from apps.audit.services import log_audit
        pharmacy = get_object_or_404(Pharmacy, pk=pk)
        pharmacy.is_verified = True
        pharmacy.save(update_fields=('is_verified', 'updated_at'))
        log_audit(actor=request.user, action='verify_pharmacy', target=pharmacy)
        return Response(self.get_serializer(pharmacy).data)


class PharmacyStockViewSet(viewsets.ModelViewSet):
    """Pharmacist's own stock only. Customers learn about availability through
    /api/search/, which hides pharmacy identity."""

    serializer_class = PharmacyStockSerializer
    permission_classes = (permissions.IsAuthenticated, IsPharmacyOwner)
    filterset_fields = ('medicine', 'is_available')

    def get_queryset(self):
        user = self.request.user
        if user.is_authenticated and user.is_pharmacist:
            return PharmacyStock.objects.select_related('medicine', 'pharmacy').filter(
                pharmacy__owner=user,
            )
        if user.is_staff:
            return PharmacyStock.objects.select_related('medicine', 'pharmacy').all()
        return PharmacyStock.objects.none()

    def perform_create(self, serializer):
        user = self.request.user
        if not user.is_pharmacist:
            raise PermissionDenied('Only pharmacists may add stock entries.')
        try:
            pharmacy = user.pharmacy
        except Pharmacy.DoesNotExist as exc:
            raise ValidationError('Register your pharmacy before adding stock.') from exc
        serializer.save(pharmacy=pharmacy)


class NightShiftViewSet(viewsets.ModelViewSet):
    """Staff-only CRUD for night shift assignments. Pharmacists can read
    their own pharmacy's shifts."""

    queryset = NightShift.objects.select_related('pharmacy').all()
    serializer_class = NightShiftSerializer
    permission_classes = (permissions.IsAuthenticated,)
    filterset_fields = ('pharmacy',)

    def get_queryset(self):
        user = self.request.user
        qs = self.queryset
        # Optional date-range filter shared by everyone with read access.
        starts_after = self.request.query_params.get('starts_after')
        ends_before = self.request.query_params.get('ends_before')
        if starts_after:
            qs = qs.filter(starts_at__gte=starts_after)
        if ends_before:
            qs = qs.filter(ends_at__lte=ends_before)
        if user.is_staff:
            return qs
        if user.is_authenticated and user.is_pharmacist:
            return qs.filter(pharmacy__owner=user)
        return NightShift.objects.none()

    def _check_staff(self):
        if not self.request.user.is_staff:
            raise PermissionDenied('Only staff may assign night shifts.')

    def perform_create(self, serializer):
        from apps.audit.services import log_audit
        self._check_staff()
        shift = serializer.save(created_by=self.request.user)
        log_audit(actor=self.request.user, action='create_night_shift', target=shift)

    def perform_update(self, serializer):
        from apps.audit.services import log_audit
        self._check_staff()
        shift = serializer.save()
        log_audit(actor=self.request.user, action='update_night_shift', target=shift)

    def perform_destroy(self, instance):
        from apps.audit.services import log_audit
        self._check_staff()
        log_audit(
            actor=self.request.user, action='delete_night_shift', target=instance,
            pharmacy_id=instance.pharmacy_id,
        )
        instance.delete()

    @action(detail=False, methods=('get',))
    def active(self, request):
        from django.utils import timezone
        now = timezone.now()
        qs = self.get_queryset().filter(starts_at__lte=now, ends_at__gte=now)
        return Response(self.get_serializer(qs, many=True).data)


class OpenPharmaciesView(APIView):
    """GET /api/pharmacies/open-now/?lat=&lng=&radius=&night_only=

    Public. All query params are optional; without lat/lng the response is not
    distance-sorted and `distance_m` is null.
    """

    permission_classes = (permissions.AllowAny,)

    def get(self, request):
        only_night = request.query_params.get('night_only', '').lower() in ('1', 'true', 'yes')
        qs = open_pharmacies_queryset(only_night=only_night)

        lat = request.query_params.get('lat')
        lng = request.query_params.get('lng')
        if lat is not None and lng is not None:
            try:
                point = Point(float(lng), float(lat), srid=4326)
            except (TypeError, ValueError):
                return Response(
                    {'error': 'lat and lng must be valid floats.'},
                    status=400,
                )
            radius = int(request.query_params.get('radius', 5000))
            qs = (
                qs.filter(location__distance_lte=(point, D(m=radius)))
                .annotate(distance=Distance('location', point))
                .order_by('distance')
            )
        else:
            qs = qs.order_by('name')

        results = OpenPharmacySerializer(qs[:200], many=True).data
        return Response({'results': results})


class PharmacyIsOpenView(APIView):
    """GET /api/pharmacies/{id}/is_open/  — admin/internal."""

    permission_classes = (IsAdmin,)

    def get(self, request, pk):
        pharmacy = get_object_or_404(Pharmacy, pk=pk)
        is_open, reason = is_open_now(pharmacy)
        return Response({
            'pharmacy_id': pharmacy.id,
            'is_open': is_open,
            'reason': reason,
        }, status=status.HTTP_200_OK)

"""Admin-only stats endpoints. ORM aggregations only — no caching yet.
Add Redis caching here if these get slow."""
from django.db.models import Avg, Count, F, Q, Sum
from django.db.models.functions import TruncDate
from django.utils.dateparse import parse_date
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.orders.constants import OrderStatus
from apps.orders.models import Order, OrderItem


class IsStaff(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_staff)


class _RangeMixin:
    """Pulls ?from=YYYY-MM-DD&to=YYYY-MM-DD into a queryset filter."""

    def filter_range(self, qs, request, field='created_at'):
        date_from = parse_date(request.query_params.get('from', '') or '')
        date_to = parse_date(request.query_params.get('to', '') or '')
        if date_from:
            qs = qs.filter(**{f'{field}__date__gte': date_from})
        if date_to:
            qs = qs.filter(**{f'{field}__date__lte': date_to})
        return qs


class OrderStatsView(_RangeMixin, APIView):
    """GET /api/admin/stats/orders/?from=&to=

    Returns: total counts + revenue, breakdown by status, daily series.
    """

    permission_classes = (IsStaff,)

    def get(self, request):
        qs = self.filter_range(Order.objects.all(), request)
        totals = qs.aggregate(
            count=Count('id'),
            revenue=Sum('grand_total'),
        )
        by_status = list(
            qs.values('status').annotate(count=Count('id')).order_by('-count')
        )
        daily = list(
            qs.annotate(day=TruncDate('created_at'))
            .values('day')
            .annotate(count=Count('id'), revenue=Sum('grand_total'))
            .order_by('day')
        )
        return Response({
            'totals': {
                'count': totals['count'] or 0,
                'revenue': str(totals['revenue'] or 0),
            },
            'by_status': by_status,
            'daily': daily,
        })


class PharmacyStatsView(_RangeMixin, APIView):
    """GET /api/admin/stats/pharmacies/  — top by order volume + revenue."""

    permission_classes = (IsStaff,)

    def get(self, request):
        qs = self.filter_range(
            Order.objects.exclude(pharmacy__isnull=True),
            request,
        )
        rows = list(
            qs.values('pharmacy_id', name=F('pharmacy__name'))
            .annotate(
                orders=Count('id'),
                revenue=Sum('grand_total'),
                delivered=Count('id', filter=Q(status=OrderStatus.DELIVERED)),
            )
            .order_by('-orders')[:50]
        )
        return Response({'top_pharmacies': rows})


class AgentStatsView(_RangeMixin, APIView):
    """GET /api/admin/stats/agents/  — agent performance: deliveries + avg time."""

    permission_classes = (IsStaff,)

    def get(self, request):
        qs = self.filter_range(
            Order.objects.exclude(delivery_agent__isnull=True),
            request,
        )
        rows = list(
            qs.filter(status=OrderStatus.DELIVERED)
            .values('delivery_agent_id', name=F('delivery_agent__first_name'))
            .annotate(
                deliveries=Count('id'),
                avg_total=Avg('grand_total'),
            )
            .order_by('-deliveries')[:50]
        )
        return Response({'top_agents': rows})


class MedicineStatsView(_RangeMixin, APIView):
    """GET /api/admin/stats/medicines/  — most-ordered medicines (by quantity)."""

    permission_classes = (IsStaff,)

    def get(self, request):
        qs = self.filter_range(
            OrderItem.objects.all(),
            request,
        )
        rows = list(
            qs.values('medicine_id', name=F('medicine__name'))
            .annotate(
                orders=Count('order_id', distinct=True),
                units=Sum('quantity'),
                revenue=Sum(F('quantity') * F('unit_price')),
            )
            .order_by('-units')[:50]
        )
        return Response({'top_medicines': rows})

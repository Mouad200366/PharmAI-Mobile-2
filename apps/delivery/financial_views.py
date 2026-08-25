from rest_framework import permissions, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.constants import UserRole
from apps.delivery.financial_serializers import (
    CashSettlementHistorySerializer,
    DeliveryEarningHistorySerializer,
)
from apps.delivery.services.financial_summary import (
    get_cash_summary,
    get_earning_history,
    get_earnings_summary,
    get_settlement_history,
)


class _DeliveryFinancialMixin:
    permission_classes = (
        permissions.IsAuthenticated,
    )

    def get_agent(self):
        user = self.request.user

        if user.role != UserRole.DELIVERY:
            raise PermissionDenied(
                "Delivery-agent access required.",
            )

        return user


class EarningsSummaryView(_DeliveryFinancialMixin, APIView):
    def get(self, request):
        summary = get_earnings_summary(
            agent=self.get_agent(),
        )

        return Response(
            summary,
            status=status.HTTP_200_OK,
        )


class EarningsHistoryView(_DeliveryFinancialMixin, APIView):
    def get(self, request):
        history = get_earning_history(
            agent=self.get_agent(),
        )

        serializer = DeliveryEarningHistorySerializer(
            history,
            many=True,
        )

        return Response(
            serializer.data,
            status=status.HTTP_200_OK,
        )


class CashSummaryView(_DeliveryFinancialMixin, APIView):
    def get(self, request):
        summary = get_cash_summary(
            agent=self.get_agent(),
        )

        return Response(
            summary,
            status=status.HTTP_200_OK,
        )


class CashSettlementHistoryView(_DeliveryFinancialMixin, APIView):
    def get(self, request):
        history = get_settlement_history(
            agent=self.get_agent(),
        )

        serializer = CashSettlementHistorySerializer(
            history,
            many=True,
        )

        return Response(
            serializer.data,
            status=status.HTTP_200_OK,
        )
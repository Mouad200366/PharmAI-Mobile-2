from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone

from apps.delivery.models import (
    CashSettlement,
    DeliveryEarning,
    DeliveryEarningStatus,
)
from apps.delivery.services.cash_settlements import get_agent_cash_balance


def get_earnings_summary(*, agent):
    today = timezone.localdate()

    earned_statuses = (
        DeliveryEarningStatus.EARNED,
        DeliveryEarningStatus.PAID,
    )

    today_earned = (
        DeliveryEarning.objects
        .filter(
            agent=agent,
            status__in=earned_statuses,
            earned_at__date=today,
        )
        .aggregate(total=Sum("amount"))
        .get("total")
        or Decimal("0.00")
    )

    total_earned = (
        DeliveryEarning.objects
        .filter(
            agent=agent,
            status__in=earned_statuses,
        )
        .aggregate(total=Sum("amount"))
        .get("total")
        or Decimal("0.00")
    )

    total_paid = (
        DeliveryEarning.objects
        .filter(
            agent=agent,
            status=DeliveryEarningStatus.PAID,
        )
        .aggregate(total=Sum("amount"))
        .get("total")
        or Decimal("0.00")
    )

    return {
        "today_earned": today_earned,
        "total_earned": total_earned,
        "total_paid": total_paid,
        "currency": "MAD",
    }


def get_earning_history(*, agent):
    return (
        DeliveryEarning.objects
        .filter(agent=agent)
        .select_related("order")
        .order_by("-created_at", "-id")
    )


def get_cash_summary(*, agent):
    return {
        "outstanding_cash": get_agent_cash_balance(
            agent=agent,
            currency="MAD",
        ),
        "currency": "MAD",
    }


def get_settlement_history(*, agent):
    return (
        CashSettlement.objects
        .filter(agent=agent)
        .order_by("-created_at", "-id")
    )
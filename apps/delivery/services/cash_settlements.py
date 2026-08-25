from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.delivery.models import (
    AgentCashTransaction,
    AgentCashTransactionType,
    CashSettlement,
    CashSettlementStatus,
)


User = get_user_model()


def get_agent_cash_balance(*, agent, currency="MAD"):
    total = (
        AgentCashTransaction.objects
        .filter(
            agent=agent,
            currency=currency,
        )
        .aggregate(total=Sum("amount"))
        .get("total")
    )

    return total or Decimal("0.00")


def complete_cash_settlement(*, settlement_id):
    """Complete one pending cash settlement atomically.

    The agent row is locked so two concurrent settlements for the same courier
    cannot both spend the same cash balance.
    """
    with transaction.atomic():
        settlement = (
            CashSettlement.objects
            .select_for_update()
            .filter(pk=settlement_id)
            .first()
        )

        if settlement is None:
            raise ValidationError(
                "Cash settlement not found.",
            )

        if settlement.status != CashSettlementStatus.PENDING:
            raise ValidationError(
                "This cash settlement is no longer pending.",
            )

        agent = (
            User.objects
            .select_for_update()
            .get(pk=settlement.agent_id)
        )

        balance = get_agent_cash_balance(
            agent=agent,
            currency=settlement.currency,
        )

        if settlement.amount > balance:
            raise ValidationError(
                "Settlement amount exceeds the courier's current cash balance.",
            )

        now = timezone.now()

        AgentCashTransaction.objects.create(
            agent=agent,
            transaction_type=AgentCashTransactionType.SETTLEMENT,
            amount=-settlement.amount,
            currency=settlement.currency,
            note=f"Cash settlement #{settlement.id} completed.",
        )

        settlement.status = CashSettlementStatus.COMPLETED
        settlement.completed_at = now
        settlement.save(
            update_fields=(
                "status",
                "completed_at",
                "updated_at",
            )
        )

    return settlement
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.notifications.constants import NotificationType
from apps.notifications.services import notify
from apps.orders.constants import OrderStatus
from apps.orders.models import Order
from apps.orders.services.state_machine import ACTIVE_AGENT_STATUSES
from apps.tracking.services.broadcast import (
    broadcast_delivery_assignment_updated,
    broadcast_delivery_offer_cancelled,
    broadcast_delivery_offer_expired,
)

from ..models import (
    DeliveryAgentProfile,
    DeliveryOffer,
    DeliveryOfferStatus,
)


def _redispatch(order):
    from apps.orders.services.place_order import _try_assign_agent

    return _try_assign_agent(order)


def _expire_offer_locked(offer, *, now):
    offer.status = DeliveryOfferStatus.EXPIRED
    offer.responded_at = now
    offer.save(
        update_fields=(
            'status',
            'responded_at',
            'updated_at',
        )
    )

    transaction.on_commit(
        lambda agent_id=offer.agent_id, offer_id=offer.id:
            broadcast_delivery_offer_expired(
                agent_id=agent_id,
                offer_id=offer_id,
            )
    )


def expire_stale_offers(*, limit=100):
    """Expire stale pending offers and re-dispatch their orders.

    This is intended for a periodic background task so an offer does not stay
    pending forever when the courier never opens the app or never polls REST.

    Each offer is revalidated under a row lock before it is expired. Re-dispatch
    happens after the expiry transaction commits, which keeps the unique
    pending-offer constraints safe.
    """
    now = timezone.now()

    stale_offer_ids = list(
        DeliveryOffer.objects
        .filter(
            status=DeliveryOfferStatus.PENDING,
            expires_at__lte=now,
        )
        .order_by('expires_at')
        .values_list('id', flat=True)[:limit]
    )

    expired_count = 0
    redispatched_count = 0

    for offer_id in stale_offer_ids:
        order = None

        with transaction.atomic():
            offer = (
                DeliveryOffer.objects
                .select_for_update()
                .select_related('order')
                .filter(pk=offer_id)
                .first()
            )

            if offer is None:
                continue

            if offer.status != DeliveryOfferStatus.PENDING:
                continue

            locked_now = timezone.now()
            if offer.expires_at > locked_now:
                continue

            _expire_offer_locked(
                offer,
                now=locked_now,
            )
            order = offer.order
            expired_count += 1

        if (
            order is not None
            and order.status == OrderStatus.AWAITING_AGENT
            and order.delivery_agent_id is None
        ):
            next_offer = _redispatch(order)
            if next_offer is not None:
                redispatched_count += 1

    return {
        'considered': len(stale_offer_ids),
        'expired': expired_count,
        'redispatched': redispatched_count,
    }


def cancel_pending_offers_for_order(order):
    """Cancel pending delivery offers when an order leaves dispatch eligibility.

    The database state is updated atomically and each affected courier is
    notified only after the surrounding transaction successfully commits.
    """
    now = timezone.now()

    with transaction.atomic():
        pending_offers = list(
            DeliveryOffer.objects
            .select_for_update()
            .filter(
                order=order,
                status=DeliveryOfferStatus.PENDING,
            )
        )

        if not pending_offers:
            return 0

        for offer in pending_offers:
            offer.status = DeliveryOfferStatus.CANCELLED
            offer.responded_at = now
            offer.save(
                update_fields=(
                    'status',
                    'responded_at',
                    'updated_at',
                )
            )

            transaction.on_commit(
                lambda agent_id=offer.agent_id, offer_id=offer.id:
                    broadcast_delivery_offer_cancelled(
                        agent_id=agent_id,
                        offer_id=offer_id,
                    )
            )

    return len(pending_offers)


def get_current_offer(agent):
    """Return the agent's current valid offer, expiring stale offers safely."""
    offer = (
        DeliveryOffer.objects
        .select_related('order__pharmacy')
        .prefetch_related('order__items')
        .filter(
            agent=agent,
            status=DeliveryOfferStatus.PENDING,
        )
        .order_by('-created_at')
        .first()
    )

    if offer is None:
        return None

    now = timezone.now()

    if offer.expires_at > now:
        return offer

    redispatch_order = None

    with transaction.atomic():
        locked_offer = (
            DeliveryOffer.objects
            .select_for_update()
            .select_related('order')
            .filter(pk=offer.pk)
            .first()
        )

        if locked_offer is None:
            return None

        if locked_offer.status != DeliveryOfferStatus.PENDING:
            return None

        now = timezone.now()

        if locked_offer.expires_at > now:
            return (
                DeliveryOffer.objects
                .select_related('order__pharmacy')
                .prefetch_related('order__items')
                .get(pk=locked_offer.pk)
            )

        _expire_offer_locked(
            locked_offer,
            now=now,
        )
        redispatch_order = locked_offer.order

    if redispatch_order is not None:
        _redispatch(redispatch_order)

    return None


def accept_offer(*, offer_id, agent):
    """Accept a pending offer and atomically assign its order to the agent."""
    redispatch_order = None
    error = None
    accepted_offer = None

    with transaction.atomic():
        # Read only the order id first. This does not acquire a row lock.
        # The authoritative offer state is re-read and validated below
        # after the order row has been locked.
        offer_ref = (
            DeliveryOffer.objects
            .filter(
                pk=offer_id,
                agent=agent,
            )
            .values('order_id')
            .first()
        )

        if offer_ref is None:
            error = ValidationError(
                'Delivery offer not found.',
            )
        else:
            order = (
                Order.objects
                .select_for_update()
                .filter(pk=offer_ref['order_id'])
                .first()
            )

            if order is None:
                error = ValidationError(
                    'Order not found.',
                )
            else:
                # Keep the same lock order as offer dispatch:
                # Order -> DeliveryOffer -> DeliveryAgentProfile.
                offer = (
                    DeliveryOffer.objects
                    .select_for_update()
                    .filter(
                        pk=offer_id,
                        agent=agent,
                        order_id=order.id,
                    )
                    .first()
                )

                if offer is None:
                    error = ValidationError(
                        'Delivery offer not found.',
                    )
                elif offer.status != DeliveryOfferStatus.PENDING:
                    error = ValidationError(
                        'This delivery offer is no longer available.',
                    )
                else:
                    now = timezone.now()

                    if offer.expires_at <= now:
                        _expire_offer_locked(
                            offer,
                            now=now,
                        )
                        redispatch_order = order
                        error = ValidationError(
                            'This delivery offer has expired.',
                        )
                    else:
                        profile = (
                            DeliveryAgentProfile.objects
                            .select_for_update()
                            .filter(user=agent)
                            .first()
                        )

                        if profile is None:
                            error = ValidationError(
                                'Delivery profile not found.',
                            )
                        elif not profile.can_work:
                            error = ValidationError(
                                'Your delivery account cannot accept offers.',
                            )
                        elif not profile.has_fresh_location():
                            error = ValidationError(
                                'You must be online with a fresh location to accept an offer.',
                            )
                        elif order.status != OrderStatus.AWAITING_AGENT:
                            error = ValidationError(
                                'This order is no longer awaiting a delivery agent.',
                            )
                        elif order.delivery_agent_id is not None:
                            error = ValidationError(
                                'This order already has a delivery agent.',
                            )
                        elif (
                            Order.objects
                            .filter(
                                delivery_agent=agent,
                                status__in=ACTIVE_AGENT_STATUSES,
                            )
                            .exists()
                        ):
                            error = ValidationError(
                                'You already have an active delivery.',
                            )
                        else:
                            from apps.delivery.models import (
                                DeliveryEarning,
                                DeliveryEarningStatus,
                            )

                            earning = (
                                DeliveryEarning.objects
                                .select_for_update()
                                .filter(order=order)
                                .first()
                            )

                            if (
                                earning is not None
                                and earning.status != DeliveryEarningStatus.CANCELLED
                            ):
                                error = ValidationError(
                                    'This order already has an active delivery earning.',
                                )
                            else:
                                order.delivery_agent = agent
                                order.save(
                                    update_fields=(
                                        'delivery_agent',
                                        'updated_at',
                                    )
                                )

                                notify(
                                    user=order.customer,
                                    type=NotificationType.AGENT_ASSIGNED,
                                    title='Courier assigned',
                                    body='A courier has been assigned to your order.',
                                    order_id=order.id,
                                    agent_name=agent.full_name,
                                )

                                offer.status = DeliveryOfferStatus.ACCEPTED
                                offer.responded_at = now
                                offer.save(
                                    update_fields=(
                                        'status',
                                        'responded_at',
                                        'updated_at',
                                    )
                                )

                                accepted_offer = offer

                                if earning is None:
                                    DeliveryEarning.objects.create(
                                        order=order,
                                        agent=agent,
                                        amount=offer.earning_amount,
                                    )
                                else:
                                    earning.agent = agent
                                    earning.amount = offer.earning_amount
                                    earning.currency = 'MAD'
                                    earning.status = DeliveryEarningStatus.PENDING
                                    earning.earned_at = None
                                    earning.paid_at = None
                                    earning.save(
                                        update_fields=(
                                            'agent',
                                            'amount',
                                            'currency',
                                            'status',
                                            'earned_at',
                                            'paid_at',
                                            'updated_at',
                                        )
                                    )

                                transaction.on_commit(
                                    lambda agent_id=agent.id, order_id=order.id:
                                        broadcast_delivery_assignment_updated(
                                            agent_id=agent_id,
                                            order_id=order_id,
                                        )
                                )

    if redispatch_order is not None:
        _redispatch(redispatch_order)

    if error is not None:
        raise error

    return accepted_offer

def decline_offer(*, offer_id, agent):
    """Decline a pending offer, then attempt dispatch to the next candidate."""
    redispatch_order = None
    error = None
    declined_offer = None

    with transaction.atomic():
        offer = (
            DeliveryOffer.objects
            .select_for_update()
            .filter(
                pk=offer_id,
                agent=agent,
            )
            .first()
        )

        if offer is None:
            error = ValidationError(
                'Delivery offer not found.',
            )
        elif offer.status != DeliveryOfferStatus.PENDING:
            error = ValidationError(
                'This delivery offer is no longer available.',
            )
        else:
            now = timezone.now()

            if offer.expires_at <= now:
                _expire_offer_locked(
                    offer,
                    now=now,
                )
                redispatch_order = offer.order
                error = ValidationError(
                    'This delivery offer has expired.',
                )
            else:
                offer.status = DeliveryOfferStatus.DECLINED
                offer.responded_at = now
                offer.save(
                    update_fields=(
                        'status',
                        'responded_at',
                        'updated_at',
                    )
                )

                declined_offer = offer
                redispatch_order = offer.order

    if redispatch_order is not None:
        _redispatch(redispatch_order)

    if error is not None:
        raise error

    return declined_offer
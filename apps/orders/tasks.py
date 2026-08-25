from celery import shared_task

from apps.delivery.models import DeliveryOffer, DeliveryOfferStatus

from .constants import OrderStatus
from .models import Order


@shared_task
def retry_stuck_orders():
    """Retry delivery dispatch for orders still waiting for an agent.

    Dispatch no longer assigns an agent directly. This task asks the delivery
    offer service to keep one valid offer active for each eligible
    ``awaiting_agent`` order.
    """
    from .services.place_order import _try_assign_agent

    candidates = (
        Order.objects
        .filter(
            status=OrderStatus.AWAITING_AGENT,
            delivery_agent__isnull=True,
        )
        .select_related('pharmacy')
    )

    considered = candidates.count()
    offers_created = 0

    for order in candidates:
        previous_pending_offer_id = (
            DeliveryOffer.objects
            .filter(
                order=order,
                status=DeliveryOfferStatus.PENDING,
            )
            .values_list('id', flat=True)
            .first()
        )

        offer = _try_assign_agent(order)

        if (
            offer is not None
            and offer.status == DeliveryOfferStatus.PENDING
            and offer.id != previous_pending_offer_id
        ):
            offers_created += 1

    return {
        'considered': considered,
        'offers_created': offers_created,
    }
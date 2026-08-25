from datetime import timedelta
from decimal import Decimal

from django.contrib.gis.geos import Point
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.catalog.models import Medicine
from apps.delivery.models import DeliveryOffer, DeliveryOfferStatus
from apps.notifications.constants import NotificationType
from apps.notifications.models import Notification
from apps.notifications.services import send_push_to_user
from apps.tracking.services.broadcast import broadcast_delivery_offer_available

from ..constants import OrderStatus, PaymentMethod, PrescriptionMode, PrescriptionStatus
from ..models import Order, OrderItem, OrderStatusHistory, Prescription
from .agent_selection import select_agent_for_order
from .pharmacy_selection import select_pharmacy_for_order
from .stock import decrement_stock

DELIVERY_FEE = Decimal('15.00')
DELIVERY_AGENT_EARNING = Decimal('15.00')
DELIVERY_OFFER_TTL_SECONDS = 60


@transaction.atomic
def place_order(
    *,
    customer,
    items,
    delivery_address: str,
    latitude: float,
    longitude: float,
    prescription_mode: str = PrescriptionMode.NONE,
    payment_method: str = PaymentMethod.CASH,
    prescription_photo=None,
    notes: str = '',
):
    if not items:
        raise ValidationError({'items': 'At least one item is required.'})

    delivery_location = Point(longitude, latitude, srid=4326)

    medicine_ids = [item['medicine'] for item in items]
    medicines = {
        m.id: m
        for m in Medicine.objects.filter(
            id__in=medicine_ids,
            is_active=True,
        )
    }

    if len(medicines) != len(set(medicine_ids)):
        raise ValidationError(
            {'items': 'One or more medicines are unknown or inactive.'},
        )

    rx_required = any(
        medicine.requires_prescription
        for medicine in medicines.values()
    )

    if rx_required and prescription_mode == PrescriptionMode.NONE:
        raise ValidationError(
            {
                'prescription_mode':
                    'Prescription required for one or more items.'
            },
        )

    if (
        prescription_mode == PrescriptionMode.PHOTO
        and not prescription_photo
    ):
        raise ValidationError(
            {
                'prescription_photo':
                    'A photo is required when prescription_mode=photo.'
            },
        )

    pharmacy = select_pharmacy_for_order(
        items,
        delivery_location,
    )

    if pharmacy is None:
        raise ValidationError(
            'No pharmacy in your area can fulfill this order right now.',
        )

    locked = decrement_stock(
        pharmacy,
        items,
    )

    items_total = sum(
        (
            price * quantity
            for _, quantity, price in locked
        ),
        Decimal('0'),
    )

    grand_total = items_total + DELIVERY_FEE

    if payment_method == PaymentMethod.CARD:
        initial_status = OrderStatus.PENDING_PAYMENT
    elif prescription_mode == PrescriptionMode.PHOTO:
        initial_status = OrderStatus.PENDING_REVIEW
    else:
        initial_status = OrderStatus.ACCEPTED

    order = Order.objects.create(
        customer=customer,
        pharmacy=pharmacy,
        delivery_address=delivery_address,
        delivery_location=delivery_location,
        items_total=items_total,
        delivery_fee=DELIVERY_FEE,
        grand_total=grand_total,
        status=initial_status,
        prescription_mode=prescription_mode,
        payment_method=payment_method,
        notes=notes,
    )

    OrderStatusHistory.objects.create(
        order=order,
        status=initial_status,
        changed_by=customer,
        note='Order created.',
    )

    for stock, quantity, price in locked:
        OrderItem.objects.create(
            order=order,
            medicine=stock.medicine,
            quantity=quantity,
            unit_price=price,
        )

    if prescription_mode == PrescriptionMode.PHOTO:
        Prescription.objects.create(
            order=order,
            photo=prescription_photo,
            status=PrescriptionStatus.PENDING,
        )
    elif prescription_mode == PrescriptionMode.PICKUP:
        Prescription.objects.create(
            order=order,
            status=PrescriptionStatus.COLLECTED,
        )

    from apps.payments.constants import PaymentProvider, PaymentStatus
    from apps.payments.models import Payment

    Payment.objects.create(
        order=order,
        provider=PaymentProvider(payment_method),
        amount=grand_total,
        status=PaymentStatus.PENDING,
    )

    return order


def _create_delivery_offer_notification(*, agent_id, offer_id, order_id):
    """Persist one courier offer in the in-app notification inbox."""
    Notification.objects.create(
        user_id=agent_id,
        type=NotificationType.DELIVERY_OFFER_AVAILABLE,
        title='Nouvelle livraison disponible',
        body=(
            'Une nouvelle demande de livraison est disponible. '
            'Ouvrez PharmAI pour la consulter.'
        ),
        payload={
            'type': 'delivery_offer_available',
            'offer_id': offer_id,
            'order_id': order_id,
        },
    )


def _try_assign_agent(order):
    if (
        order.status != OrderStatus.AWAITING_AGENT
        or order.delivery_agent_id is not None
        or order.pharmacy_id is None
    ):
        return None

    now = timezone.now()

    with transaction.atomic():
        locked_order = (
            Order.objects
            .select_for_update()
            .get(pk=order.pk)
        )

        if (
            locked_order.status != OrderStatus.AWAITING_AGENT
            or locked_order.delivery_agent_id is not None
            or locked_order.pharmacy_id is None
        ):
            return None

        pending_offer = (
            DeliveryOffer.objects
            .select_for_update()
            .filter(
                order=locked_order,
                status=DeliveryOfferStatus.PENDING,
            )
            .first()
        )

        if pending_offer is not None:
            if pending_offer.expires_at > now:
                return pending_offer

            pending_offer.status = DeliveryOfferStatus.EXPIRED
            pending_offer.responded_at = now
            pending_offer.save(
                update_fields=(
                    'status',
                    'responded_at',
                    'updated_at',
                )
            )

        previously_offered_agent_ids = (
            DeliveryOffer.objects
            .filter(order=locked_order)
            .values_list('agent_id', flat=True)
            .distinct()
        )

        agent = select_agent_for_order(
            locked_order.pharmacy.location,
            exclude_agent_ids=previously_offered_agent_ids,
        )

        if agent is None:
            return None

        offer = DeliveryOffer.objects.create(
            order=locked_order,
            agent=agent,
            expires_at=(
                now
                + timedelta(
                    seconds=DELIVERY_OFFER_TTL_SECONDS,
                )
            ),
            earning_amount=DELIVERY_AGENT_EARNING,
        )

        transaction.on_commit(
            lambda agent_id=agent.id, offer_id=offer.id, order_id=locked_order.id:
                _create_delivery_offer_notification(
                    agent_id=agent_id,
                    offer_id=offer_id,
                    order_id=order_id,
                ),
            robust=True,
        )

        transaction.on_commit(
            lambda agent=agent, offer_id=offer.id, order_id=locked_order.id:
                send_push_to_user(
                    user=agent,
                    title='New delivery offer',
                    body=(
                        'A new delivery request is available. '
                        'Open PharmAI to review it.'
                    ),
                    data={
                        'type': 'delivery_offer_available',
                        'offer_id': offer_id,
                        'order_id': order_id,
                    },
                    priority='high',
                ),
            robust=True,
        )

        transaction.on_commit(
            lambda agent_id=agent.id, offer_id=offer.id:
                broadcast_delivery_offer_available(
                    agent_id=agent_id,
                    offer_id=offer_id,
                )
        )

        return offer
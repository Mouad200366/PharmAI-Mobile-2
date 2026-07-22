from decimal import Decimal

from django.contrib.gis.geos import Point
from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.catalog.models import Medicine

from ..constants import OrderStatus, PaymentMethod, PrescriptionMode, PrescriptionStatus
from ..models import Order, OrderItem, Prescription
from .agent_selection import select_agent_for_order
from .pharmacy_selection import select_pharmacy_for_order
from .stock import decrement_stock

# Flat MVP delivery fee — replace with distance-based pricing later.
DELIVERY_FEE = Decimal('15.00')


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
    """Place an order end-to-end.

    Steps:
    1. Validate items and prescription requirements.
    2. Pick the nearest open pharmacy that stocks everything.
    3. Lock + decrement stock; snapshot prices.
    4. Create Order + OrderItems + Prescription.
    5. If status is ACCEPTED, try to assign an agent (best-effort).

    Raises ValidationError on any failure; the @transaction.atomic block
    rolls back stock changes automatically.
    """
    if not items:
        raise ValidationError({'items': 'At least one item is required.'})

    delivery_location = Point(longitude, latitude, srid=4326)

    # --- Validate medicines + Rx logic ---
    medicine_ids = [item['medicine'] for item in items]
    medicines = {
        m.id: m for m in Medicine.objects.filter(id__in=medicine_ids, is_active=True)
    }
    if len(medicines) != len(set(medicine_ids)):
        raise ValidationError({'items': 'One or more medicines are unknown or inactive.'})

    rx_required = any(m.requires_prescription for m in medicines.values())
    if rx_required and prescription_mode == PrescriptionMode.NONE:
        raise ValidationError(
            {'prescription_mode': 'Prescription required for one or more items.'},
        )
    if prescription_mode == PrescriptionMode.PHOTO and not prescription_photo:
        raise ValidationError(
            {'prescription_photo': 'A photo is required when prescription_mode=photo.'},
        )

    # --- Pick pharmacy ---
    pharmacy = select_pharmacy_for_order(items, delivery_location)
    if pharmacy is None:
        raise ValidationError(
            'No pharmacy in your area can fulfill this order right now.',
        )

    # --- Lock stock + snapshot prices ---
    locked = decrement_stock(pharmacy, items)
    items_total = sum((price * qty for _, qty, price in locked), Decimal('0'))
    grand_total = items_total + DELIVERY_FEE

    # --- Initial status ---
    # Card orders wait for the Stripe webhook to mark payment paid before the
    # pharmacy is notified. Cash orders proceed straight into the normal flow.
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

    for stock, qty, price in locked:
        OrderItem.objects.create(
            order=order, medicine=stock.medicine, quantity=qty, unit_price=price,
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

    # --- Create the matching Payment record ---
    # Lazy import — payments app depends on orders, not the other way around.
    from apps.payments.constants import PaymentProvider, PaymentStatus
    from apps.payments.models import Payment
    Payment.objects.create(
        order=order,
        provider=PaymentProvider(payment_method),
        amount=grand_total,
        status=PaymentStatus.PENDING,
    )

    # --- Best-effort agent assignment for cash orders that are immediately ACCEPTED ---
    if order.status == OrderStatus.ACCEPTED:
        _try_assign_agent(order)

    return order


def _try_assign_agent(order):
    agent = select_agent_for_order(order.pharmacy.location)
    if agent is not None:
        order.delivery_agent = agent
        order.save(update_fields=('delivery_agent', 'updated_at'))

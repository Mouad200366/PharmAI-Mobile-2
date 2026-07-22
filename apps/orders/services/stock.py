from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.pharmacies.models import PharmacyStock


@transaction.atomic
def decrement_stock(pharmacy, items):
    """Lock + decrement stock rows for the given items.

    `items` is an iterable of dicts: {'medicine': <id>, 'quantity': <int>}.
    Raises ValidationError if any row is missing or insufficient.
    Returns: list of (PharmacyStock, quantity, unit_price) tuples for caller's use.
    """
    locked = []
    for item in items:
        try:
            stock = (
                PharmacyStock.objects
                .select_for_update()
                .select_related('medicine')
                .get(pharmacy=pharmacy, medicine_id=item['medicine'])
            )
        except PharmacyStock.DoesNotExist as exc:
            raise ValidationError(
                f'Pharmacy does not stock medicine #{item["medicine"]}.',
            ) from exc
        if not stock.is_available or stock.quantity < item['quantity']:
            raise ValidationError(
                f'Insufficient stock for {stock.medicine.name}.',
            )
        stock.quantity -= item['quantity']
        stock.save(update_fields=('quantity', 'updated_at'))
        locked.append((stock, item['quantity'], stock.price))
    return locked


@transaction.atomic
def refund_stock(order):
    """Restore stock for every item on a cancelled/rejected order. Idempotent
    is the caller's responsibility — only call once per order."""
    for item in order.items.select_related('medicine').all():
        stock = (
            PharmacyStock.objects
            .select_for_update()
            .filter(pharmacy=order.pharmacy, medicine=item.medicine)
            .first()
        )
        if stock is None:
            continue
        stock.quantity += item.quantity
        stock.save(update_fields=('quantity', 'updated_at'))

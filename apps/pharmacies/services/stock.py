from decimal import Decimal

from django.db import transaction

from apps.catalog.models import Medicine

from ..models import Pharmacy, PharmacyStock


@transaction.atomic
def upsert_stock(
    *,
    pharmacy: Pharmacy,
    medicine: Medicine,
    price: Decimal,
    quantity: int,
    is_available: bool = True,
) -> PharmacyStock:
    stock, _ = PharmacyStock.objects.update_or_create(
        pharmacy=pharmacy,
        medicine=medicine,
        defaults={
            'price': price,
            'quantity': quantity,
            'is_available': is_available,
        },
    )
    return stock

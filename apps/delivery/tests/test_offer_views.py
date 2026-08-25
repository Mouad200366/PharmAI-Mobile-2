from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.constants import UserRole
from apps.delivery.models import (
    DeliveryAgentProfile,
    DeliveryOffer,
    DeliveryOfferStatus,
)
from apps.orders.constants import OrderStatus, PaymentMethod
from apps.orders.models import Order


User = get_user_model()


@pytest.fixture
def delivery_agent(db):
    return User.objects.create_user(
        phone="+212600300001",
        password="StrongPass123!",
        email="delivery.api@example.com",
        cin="DA123456",
        first_name="API",
        last_name="Courier",
        date_of_birth=date(1994, 1, 1),
        gender="M",
        role=UserRole.DELIVERY,
        is_phone_verified=True,
    )


@pytest.fixture
def delivery_profile(delivery_agent):
    return DeliveryAgentProfile.objects.create(
        user=delivery_agent,
        approved_at=timezone.now(),
        is_online=True,
        current_location=Point(-7.5900, 33.5730, srid=4326),
        location_updated_at=timezone.now(),
    )


@pytest.fixture
def delivery_client(delivery_agent):
    client = APIClient()
    client.force_authenticate(user=delivery_agent)
    return client


@pytest.fixture
def awaiting_order(patient, pharmacy):
    return Order.objects.create(
        customer=patient,
        pharmacy=pharmacy,
        delivery_address="Secret Customer Address, Casablanca",
        delivery_location=Point(-7.6320, 33.5860, srid=4326),
        items_total=Decimal("50.00"),
        delivery_fee=Decimal("15.00"),
        grand_total=Decimal("65.00"),
        status=OrderStatus.AWAITING_AGENT,
        payment_method=PaymentMethod.CASH,
        notes="Private customer note",
    )


@pytest.fixture
def pending_offer(awaiting_order, delivery_agent):
    return DeliveryOffer.objects.create(
        order=awaiting_order,
        agent=delivery_agent,
        status=DeliveryOfferStatus.PENDING,
        expires_at=timezone.now() + timedelta(seconds=20),
        earning_amount=Decimal("15.00"),
    )


@pytest.mark.django_db
def test_current_offer_returns_privacy_safe_payload(
    delivery_client,
    delivery_profile,
    pending_offer,
):
    response = delivery_client.get(
        reverse("v1:delivery-offer-current"),
    )

    assert response.status_code == 200

    offer = response.data["offer"]

    assert offer["id"] == pending_offer.id
    assert offer["order_id"] == pending_offer.order_id
    assert offer["status"] == DeliveryOfferStatus.PENDING
    assert offer["pharmacy_name"] == pending_offer.order.pharmacy.name
    assert offer["payment_method"] == PaymentMethod.CASH
    assert offer["earning_amount"] == "15.00"

    forbidden_fields = {
        "customer",
        "customer_name",
        "customer_phone",
        "delivery_address",
        "delivery_latitude",
        "delivery_longitude",
        "items",
        "medicines",
        "prescription",
        "notes",
    }

    assert forbidden_fields.isdisjoint(offer.keys())


@pytest.mark.django_db
def test_accept_offer_endpoint_assigns_agent(
    delivery_client,
    delivery_profile,
    pending_offer,
    awaiting_order,
):
    response = delivery_client.post(
        reverse(
            "v1:delivery-offer-accept",
            kwargs={"offer_id": pending_offer.id},
        ),
        {},
        format="json",
    )

    assert response.status_code == 200

    awaiting_order.refresh_from_db()
    pending_offer.refresh_from_db()

    assert pending_offer.status == DeliveryOfferStatus.ACCEPTED
    assert awaiting_order.delivery_agent_id == delivery_profile.user_id


@pytest.mark.django_db
def test_decline_offer_endpoint_keeps_order_unassigned(
    delivery_client,
    delivery_profile,
    pending_offer,
    awaiting_order,
):
    response = delivery_client.post(
        reverse(
            "v1:delivery-offer-decline",
            kwargs={"offer_id": pending_offer.id},
        ),
        {},
        format="json",
    )

    assert response.status_code == 200

    awaiting_order.refresh_from_db()
    pending_offer.refresh_from_db()

    assert pending_offer.status == DeliveryOfferStatus.DECLINED
    assert awaiting_order.delivery_agent_id is None


@pytest.mark.django_db
def test_patient_cannot_access_delivery_offer_endpoint(
    auth_client,
):
    response = auth_client.get(
        reverse("v1:delivery-offer-current"),
    )

    assert response.status_code == 403
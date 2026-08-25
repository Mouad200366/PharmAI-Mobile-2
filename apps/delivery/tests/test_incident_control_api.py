from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.contrib.gis.geos import Point
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.constants import UserRole
from apps.delivery.models import (
    DeliveryEarning,
    DeliveryEarningStatus,
    DeliveryIncident,
    DeliveryIncidentReason,
    DeliveryIncidentStatus,
    DeliveryVerification,
    DeliveryVerificationMethod,
    DeliveryVerificationType,
)
from apps.orders.constants import OrderStatus, PaymentMethod
from apps.orders.models import Order


User = get_user_model()


def _create_user(*, phone, email, cin, first_name, role):
    return User.objects.create_user(
        phone=phone,
        password="StrongPass123!",
        email=email,
        cin=cin,
        first_name=first_name,
        last_name="User",
        date_of_birth=date(1993, 1, 1),
        gender="M",
        role=role,
        is_phone_verified=True,
    )


def _create_order(*, patient, pharmacy, agent, status):
    return Order.objects.create(
        customer=patient,
        pharmacy=pharmacy,
        delivery_agent=agent,
        delivery_address="Maarif, Casablanca",
        delivery_location=Point(
            -7.6320,
            33.5860,
            srid=4326,
        ),
        items_total=Decimal("50.00"),
        delivery_fee=Decimal("15.00"),
        grand_total=Decimal("65.00"),
        status=status,
        payment_method=PaymentMethod.CASH,
    )


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def control_admin(db):
    return _create_user(
        phone="+212600900001",
        email="incident.control.admin@example.com",
        cin="CA123451",
        first_name="ControlAdmin",
        role=UserRole.ADMIN,
    )


@pytest.fixture
def control_agent(db):
    return _create_user(
        phone="+212600900002",
        email="incident.control.agent@example.com",
        cin="CA123452",
        first_name="ControlAgent",
        role=UserRole.DELIVERY,
    )


@pytest.mark.django_db
def test_admin_can_resolve_incident_and_continue(
    api_client,
    control_admin,
    control_agent,
    patient,
    pharmacy,
):
    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=control_agent,
        status=OrderStatus.OUT_FOR_DELIVERY,
    )

    incident = DeliveryIncident.objects.create(
        order=order,
        agent=control_agent,
        reason=DeliveryIncidentReason.CUSTOMER_UNREACHABLE,
        status=DeliveryIncidentStatus.OPEN,
        reported_order_status=order.status,
    )

    api_client.force_authenticate(user=control_admin)

    response = api_client.post(
        reverse(
            "v1:delivery-incident-resolve-continue",
            kwargs={"incident_id": incident.id},
        ),
        {
            "resolution_note": "Customer answered. Continue delivery.",
        },
        format="json",
    )

    assert response.status_code == 200
    assert response.data["status"] == DeliveryIncidentStatus.RESOLVED_CONTINUE
    assert response.data["resolution_note"] == "Customer answered. Continue delivery."

    order.refresh_from_db()

    assert order.status == OrderStatus.OUT_FOR_DELIVERY


@pytest.mark.django_db
def test_admin_can_require_return(
    api_client,
    control_admin,
    control_agent,
    patient,
    pharmacy,
):
    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=control_agent,
        status=OrderStatus.OUT_FOR_DELIVERY,
    )

    incident = DeliveryIncident.objects.create(
        order=order,
        agent=control_agent,
        reason=DeliveryIncidentReason.CUSTOMER_REFUSED,
        status=DeliveryIncidentStatus.OPEN,
        reported_order_status=order.status,
    )

    api_client.force_authenticate(user=control_admin)

    response = api_client.post(
        reverse(
            "v1:delivery-incident-require-return",
            kwargs={"incident_id": incident.id},
        ),
        {
            "resolution_note": "Return package to pharmacy.",
        },
        format="json",
    )

    assert response.status_code == 200
    assert response.data["status"] == DeliveryIncidentStatus.RETURN_REQUIRED
    assert response.data["resolution_note"] == "Return package to pharmacy."

    order.refresh_from_db()

    assert order.status == OrderStatus.OUT_FOR_DELIVERY


@pytest.mark.django_db
def test_admin_can_finalize_verified_return(
    api_client,
    control_admin,
    control_agent,
    patient,
    pharmacy,
):
    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=control_agent,
        status=OrderStatus.OUT_FOR_DELIVERY,
    )

    incident = DeliveryIncident.objects.create(
        order=order,
        agent=control_agent,
        reason=DeliveryIncidentReason.CUSTOMER_REFUSED,
        status=DeliveryIncidentStatus.RETURNED,
        reported_order_status=order.status,
    )

    now = timezone.now()

    DeliveryVerification.objects.create(
        order=order,
        verification_type=DeliveryVerificationType.RETURN,
        pin_hash=make_password("123456"),
        qr_token_hash=make_password("return-token"),
        expires_at=now + timedelta(minutes=30),
        used_at=now,
        verification_method=DeliveryVerificationMethod.PIN,
        verified_by=control_agent,
        verified_location=Point(
            -7.5898,
            33.5731,
            srid=4326,
        ),
    )

    earning = DeliveryEarning.objects.create(
        order=order,
        agent=control_agent,
        amount=Decimal("15.00"),
        status=DeliveryEarningStatus.PENDING,
    )

    api_client.force_authenticate(user=control_admin)

    response = api_client.post(
        reverse(
            "v1:delivery-incident-finalize-return",
            kwargs={"incident_id": incident.id},
        ),
        {
            "resolution_note": "Return verified and custody closed.",
        },
        format="json",
    )

    assert response.status_code == 200
    assert response.data["status"] == DeliveryIncidentStatus.RESOLVED
    assert response.data["resolution_note"] == "Return verified and custody closed."

    order.refresh_from_db()
    earning.refresh_from_db()

    assert order.status == OrderStatus.FAILED
    assert earning.status == DeliveryEarningStatus.CANCELLED


@pytest.mark.django_db
def test_non_admin_cannot_use_incident_control_endpoints(
    api_client,
    control_agent,
):
    api_client.force_authenticate(user=control_agent)

    urls = (
        reverse(
            "v1:delivery-incident-resolve-continue",
            kwargs={"incident_id": 999999},
        ),
        reverse(
            "v1:delivery-incident-require-return",
            kwargs={"incident_id": 999999},
        ),
        reverse(
            "v1:delivery-incident-finalize-return",
            kwargs={"incident_id": 999999},
        ),
    )

    for url in urls:
        response = api_client.post(
            url,
            {
                "resolution_note": "Not allowed.",
            },
            format="json",
        )

        assert response.status_code == 403

@pytest.mark.django_db
def test_admin_can_issue_return_verification_credentials(
    api_client,
    control_admin,
    control_agent,
    patient,
    pharmacy,
):
    from django.contrib.auth.hashers import check_password

    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=control_agent,
        status=OrderStatus.OUT_FOR_DELIVERY,
    )

    incident = DeliveryIncident.objects.create(
        order=order,
        agent=control_agent,
        reason=DeliveryIncidentReason.CUSTOMER_REFUSED,
        status=DeliveryIncidentStatus.RETURN_REQUIRED,
        reported_order_status=order.status,
    )

    api_client.force_authenticate(user=control_admin)

    response = api_client.post(
        reverse(
            "v1:delivery-incident-return-verification-issue",
            kwargs={"incident_id": incident.id},
        ),
        {},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["pin"].isdigit()
    assert len(response.data["pin"]) == 6
    assert response.data["qr_token"]
    assert response.data["expires_at"] is not None

    verification = DeliveryVerification.objects.get(
        order=order,
        verification_type=DeliveryVerificationType.RETURN,
    )

    assert verification.pin_hash != response.data["pin"]
    assert verification.qr_token_hash != response.data["qr_token"]
    assert check_password(
        response.data["pin"],
        verification.pin_hash,
    )
    assert check_password(
        response.data["qr_token"],
        verification.qr_token_hash,
    )


@pytest.mark.django_db
def test_admin_can_rotate_return_verification_credentials(
    monkeypatch,
    api_client,
    control_admin,
    control_agent,
    patient,
    pharmacy,
):
    from django.contrib.auth.hashers import check_password

    from apps.delivery.services import return_credentials

    pins = iter(("111111", "222222"))
    qr_tokens = iter(("return-api-first", "return-api-second"))

    monkeypatch.setattr(
        return_credentials,
        "_generate_return_pin",
        lambda: next(pins),
    )
    monkeypatch.setattr(
        return_credentials,
        "_generate_return_qr_token",
        lambda: next(qr_tokens),
    )

    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=control_agent,
        status=OrderStatus.OUT_FOR_DELIVERY,
    )

    incident = DeliveryIncident.objects.create(
        order=order,
        agent=control_agent,
        reason=DeliveryIncidentReason.CUSTOMER_REFUSED,
        status=DeliveryIncidentStatus.RETURNING,
        reported_order_status=order.status,
    )

    api_client.force_authenticate(user=control_admin)

    url = reverse(
        "v1:delivery-incident-return-verification-issue",
        kwargs={"incident_id": incident.id},
    )

    first = api_client.post(
        url,
        {},
        format="json",
    )
    second = api_client.post(
        url,
        {},
        format="json",
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.data["pin"] == "111111"
    assert first.data["qr_token"] == "return-api-first"
    assert second.data["pin"] == "222222"
    assert second.data["qr_token"] == "return-api-second"

    verification = DeliveryVerification.objects.get(
        order=order,
        verification_type=DeliveryVerificationType.RETURN,
    )

    assert check_password(
        "222222",
        verification.pin_hash,
    )
    assert not check_password(
        "111111",
        verification.pin_hash,
    )
    assert check_password(
        "return-api-second",
        verification.qr_token_hash,
    )
    assert not check_password(
        "return-api-first",
        verification.qr_token_hash,
    )


@pytest.mark.django_db
def test_admin_return_verification_issue_rejects_invalid_incident_state(
    api_client,
    control_admin,
    control_agent,
    patient,
    pharmacy,
):
    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=control_agent,
        status=OrderStatus.OUT_FOR_DELIVERY,
    )

    incident = DeliveryIncident.objects.create(
        order=order,
        agent=control_agent,
        reason=DeliveryIncidentReason.CUSTOMER_REFUSED,
        status=DeliveryIncidentStatus.OPEN,
        reported_order_status=order.status,
    )

    api_client.force_authenticate(user=control_admin)

    response = api_client.post(
        reverse(
            "v1:delivery-incident-return-verification-issue",
            kwargs={"incident_id": incident.id},
        ),
        {},
        format="json",
    )

    assert response.status_code == 400
    assert not DeliveryVerification.objects.filter(
        order=order,
        verification_type=DeliveryVerificationType.RETURN,
    ).exists()


@pytest.mark.django_db
def test_non_admin_cannot_issue_return_verification_credentials(
    api_client,
    control_agent,
    patient,
    pharmacy,
):
    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=control_agent,
        status=OrderStatus.OUT_FOR_DELIVERY,
    )

    incident = DeliveryIncident.objects.create(
        order=order,
        agent=control_agent,
        reason=DeliveryIncidentReason.CUSTOMER_REFUSED,
        status=DeliveryIncidentStatus.RETURN_REQUIRED,
        reported_order_status=order.status,
    )

    api_client.force_authenticate(user=control_agent)

    response = api_client.post(
        reverse(
            "v1:delivery-incident-return-verification-issue",
            kwargs={"incident_id": incident.id},
        ),
        {},
        format="json",
    )

    assert response.status_code == 403
    assert not DeliveryVerification.objects.filter(
        order=order,
        verification_type=DeliveryVerificationType.RETURN,
    ).exists()

@pytest.mark.django_db
def test_admin_can_release_pre_pickup_incident(
    monkeypatch,
    api_client,
    control_admin,
    control_agent,
    patient,
    pharmacy,
):
    from apps.delivery.models import (
        DeliveryEarning,
        DeliveryEarningStatus,
        DeliveryOffer,
        DeliveryOfferStatus,
    )

    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=control_agent,
        status=OrderStatus.AWAITING_AGENT,
    )

    accepted_offer = DeliveryOffer.objects.create(
        order=order,
        agent=control_agent,
        status=DeliveryOfferStatus.ACCEPTED,
        expires_at=timezone.now() + timedelta(seconds=20),
        earning_amount=Decimal("15.00"),
    )

    earning = DeliveryEarning.objects.create(
        order=order,
        agent=control_agent,
        amount=Decimal("15.00"),
        status=DeliveryEarningStatus.PENDING,
    )

    incident = DeliveryIncident.objects.create(
        order=order,
        agent=control_agent,
        reason=DeliveryIncidentReason.AGENT_EMERGENCY,
        status=DeliveryIncidentStatus.OPEN,
        reported_order_status=OrderStatus.AWAITING_AGENT,
        details="Courier cannot continue before pickup.",
    )

    broadcasts = []
    redispatches = []

    monkeypatch.setattr(
        "apps.delivery.services.incident_resolution."
        "broadcast_delivery_assignment_updated",
        lambda *, agent_id, order_id: broadcasts.append(
            (agent_id, order_id)
        ),
    )
    monkeypatch.setattr(
        "apps.delivery.services.offers._redispatch",
        lambda redispatch_order: redispatches.append(
            redispatch_order.id
        ),
    )

    api_client.force_authenticate(user=control_admin)

    response = api_client.post(
        reverse(
            "v1:delivery-incident-release-pre-pickup",
            kwargs={"incident_id": incident.id},
        ),
        {
            "resolution_note": "Release courier and assign another agent.",
        },
        format="json",
    )

    assert response.status_code == 200
    assert response.data["status"] == DeliveryIncidentStatus.RESOLVED
    assert (
        response.data["resolution_note"]
        == "Release courier and assign another agent."
    )

    order.refresh_from_db()
    accepted_offer.refresh_from_db()
    earning.refresh_from_db()
    incident.refresh_from_db()

    assert order.status == OrderStatus.AWAITING_AGENT
    assert order.delivery_agent_id is None
    assert accepted_offer.status == DeliveryOfferStatus.CANCELLED
    assert earning.status == DeliveryEarningStatus.CANCELLED
    assert incident.status == DeliveryIncidentStatus.RESOLVED

    assert broadcasts == [
        (control_agent.id, order.id),
    ]
    assert redispatches == [order.id]


@pytest.mark.django_db
def test_non_admin_cannot_release_pre_pickup_incident(
    api_client,
    control_agent,
    patient,
    pharmacy,
):
    from apps.delivery.models import (
        DeliveryEarning,
        DeliveryEarningStatus,
        DeliveryOffer,
        DeliveryOfferStatus,
    )

    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=control_agent,
        status=OrderStatus.AWAITING_AGENT,
    )

    accepted_offer = DeliveryOffer.objects.create(
        order=order,
        agent=control_agent,
        status=DeliveryOfferStatus.ACCEPTED,
        expires_at=timezone.now() + timedelta(seconds=20),
        earning_amount=Decimal("15.00"),
    )

    earning = DeliveryEarning.objects.create(
        order=order,
        agent=control_agent,
        amount=Decimal("15.00"),
        status=DeliveryEarningStatus.PENDING,
    )

    incident = DeliveryIncident.objects.create(
        order=order,
        agent=control_agent,
        reason=DeliveryIncidentReason.AGENT_EMERGENCY,
        status=DeliveryIncidentStatus.OPEN,
        reported_order_status=OrderStatus.AWAITING_AGENT,
    )

    api_client.force_authenticate(user=control_agent)

    response = api_client.post(
        reverse(
            "v1:delivery-incident-release-pre-pickup",
            kwargs={"incident_id": incident.id},
        ),
        {
            "resolution_note": "Not allowed.",
        },
        format="json",
    )

    assert response.status_code == 403

    order.refresh_from_db()
    accepted_offer.refresh_from_db()
    earning.refresh_from_db()
    incident.refresh_from_db()

    assert order.delivery_agent_id == control_agent.id
    assert order.status == OrderStatus.AWAITING_AGENT
    assert accepted_offer.status == DeliveryOfferStatus.ACCEPTED
    assert earning.status == DeliveryEarningStatus.PENDING
    assert incident.status == DeliveryIncidentStatus.OPEN


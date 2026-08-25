from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.contrib.gis.geos import Point
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.core.constants import UserRole
from apps.delivery.models import (
    DeliveryIncident,
    DeliveryIncidentReason,
    DeliveryIncidentStatus,
    DeliveryVerification,
    DeliveryVerificationMethod,
    DeliveryVerificationType,
)
from apps.delivery.services.return_verification import verify_delivery_return
from apps.orders.constants import OrderStatus, PaymentMethod
from apps.orders.models import Order


User = get_user_model()


def _create_delivery_agent(*, phone, email, cin, first_name):
    return User.objects.create_user(
        phone=phone,
        password="StrongPass123!",
        email=email,
        cin=cin,
        first_name=first_name,
        last_name="Courier",
        date_of_birth=date(1993, 1, 1),
        gender="M",
        role=UserRole.DELIVERY,
        is_phone_verified=True,
    )


def _create_order(*, patient, pharmacy, agent):
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
        status=OrderStatus.OUT_FOR_DELIVERY,
        payment_method=PaymentMethod.CASH,
    )


def _create_returning_incident(*, order, agent):
    return DeliveryIncident.objects.create(
        order=order,
        agent=agent,
        reason=DeliveryIncidentReason.CUSTOMER_REFUSED,
        status=DeliveryIncidentStatus.RETURNING,
        reported_order_status=order.status,
        details="Customer refused the package.",
    )


def _create_return_verification(
    *,
    order,
    pin="123456",
    qr_token="return-token",
    expires_at=None,
    used_at=None,
    failed_attempts=0,
):
    return DeliveryVerification.objects.create(
        order=order,
        verification_type=DeliveryVerificationType.RETURN,
        pin_hash=make_password(pin),
        qr_token_hash=make_password(qr_token),
        expires_at=expires_at or (timezone.now() + timedelta(minutes=30)),
        used_at=used_at,
        failed_attempts=failed_attempts,
    )


@pytest.fixture
def return_agent(db):
    return _create_delivery_agent(
        phone="+212600870001",
        email="return.agent@example.com",
        cin="RT123451",
        first_name="Return",
    )


@pytest.mark.django_db
def test_return_verification_with_pin_marks_incident_returned_and_keeps_order_status(
    return_agent,
    patient,
    pharmacy,
):
    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=return_agent,
    )
    incident = _create_returning_incident(
        order=order,
        agent=return_agent,
    )
    verification = _create_return_verification(
        order=order,
        pin="654321",
    )

    result = verify_delivery_return(
        incident_id=incident.id,
        agent=return_agent,
        credential="654321",
        method=DeliveryVerificationMethod.PIN,
        latitude=33.5731,
        longitude=-7.5898,
    )

    verification.refresh_from_db()
    order.refresh_from_db()

    assert result.status == DeliveryIncidentStatus.RETURNED
    assert verification.used_at is not None
    assert verification.verification_method == DeliveryVerificationMethod.PIN
    assert verification.verified_by_id == return_agent.id
    assert verification.verified_location is not None
    assert verification.verified_location.x == pytest.approx(-7.5898)
    assert verification.verified_location.y == pytest.approx(33.5731)
    assert order.status == OrderStatus.OUT_FOR_DELIVERY


@pytest.mark.django_db
def test_return_verification_with_qr_marks_incident_returned(
    return_agent,
    patient,
    pharmacy,
):
    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=return_agent,
    )
    incident = _create_returning_incident(
        order=order,
        agent=return_agent,
    )
    verification = _create_return_verification(
        order=order,
        qr_token="qr-return-abc",
    )

    result = verify_delivery_return(
        incident_id=incident.id,
        agent=return_agent,
        credential="qr-return-abc",
        method=DeliveryVerificationMethod.QR,
        latitude=33.5731,
        longitude=-7.5898,
    )

    verification.refresh_from_db()

    assert result.status == DeliveryIncidentStatus.RETURNED
    assert verification.verification_method == DeliveryVerificationMethod.QR
    assert verification.used_at is not None


@pytest.mark.django_db
def test_wrong_return_credential_increments_failed_attempts_and_timestamp(
    return_agent,
    patient,
    pharmacy,
):
    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=return_agent,
    )
    incident = _create_returning_incident(
        order=order,
        agent=return_agent,
    )
    verification = _create_return_verification(
        order=order,
        pin="123456",
    )

    with pytest.raises(ValidationError):
        verify_delivery_return(
            incident_id=incident.id,
            agent=return_agent,
            credential="000000",
            method=DeliveryVerificationMethod.PIN,
            latitude=33.5731,
            longitude=-7.5898,
        )

    verification.refresh_from_db()
    incident.refresh_from_db()

    assert verification.failed_attempts == 1
    assert verification.last_failed_at is not None
    assert verification.used_at is None
    assert incident.status == DeliveryIncidentStatus.RETURNING


@pytest.mark.django_db
@pytest.mark.parametrize(
    "verification_kwargs",
    (
        {
            "expires_at": timezone.now() - timedelta(minutes=1),
        },
        {
            "used_at": timezone.now(),
        },
    ),
)
def test_expired_or_used_return_verification_is_rejected(
    return_agent,
    patient,
    pharmacy,
    verification_kwargs,
):
    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=return_agent,
    )
    incident = _create_returning_incident(
        order=order,
        agent=return_agent,
    )
    _create_return_verification(
        order=order,
        **verification_kwargs,
    )

    with pytest.raises(ValidationError):
        verify_delivery_return(
            incident_id=incident.id,
            agent=return_agent,
            credential="123456",
            method=DeliveryVerificationMethod.PIN,
            latitude=33.5731,
            longitude=-7.5898,
        )

    incident.refresh_from_db()

    assert incident.status == DeliveryIncidentStatus.RETURNING


@pytest.mark.django_db
def test_unassigned_agent_cannot_verify_return(
    return_agent,
    patient,
    pharmacy,
):
    other_agent = _create_delivery_agent(
        phone="+212600870002",
        email="return.other@example.com",
        cin="RT123452",
        first_name="OtherReturn",
    )

    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=return_agent,
    )
    incident = _create_returning_incident(
        order=order,
        agent=return_agent,
    )
    _create_return_verification(
        order=order,
    )

    with pytest.raises(PermissionDenied):
        verify_delivery_return(
            incident_id=incident.id,
            agent=other_agent,
            credential="123456",
            method=DeliveryVerificationMethod.PIN,
            latitude=33.5731,
            longitude=-7.5898,
        )

    incident.refresh_from_db()

    assert incident.status == DeliveryIncidentStatus.RETURNING


@pytest.mark.django_db
def test_return_verification_rejects_wrong_incident_state(
    return_agent,
    patient,
    pharmacy,
):
    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=return_agent,
    )

    incident = DeliveryIncident.objects.create(
        order=order,
        agent=return_agent,
        reason=DeliveryIncidentReason.CUSTOMER_REFUSED,
        status=DeliveryIncidentStatus.RETURN_REQUIRED,
        reported_order_status=order.status,
    )

    _create_return_verification(
        order=order,
    )

    with pytest.raises(ValidationError):
        verify_delivery_return(
            incident_id=incident.id,
            agent=return_agent,
            credential="123456",
            method=DeliveryVerificationMethod.PIN,
            latitude=33.5731,
            longitude=-7.5898,
        )

    incident.refresh_from_db()

    assert incident.status == DeliveryIncidentStatus.RETURN_REQUIRED

@pytest.mark.django_db
def test_issue_return_verification_for_return_required_incident(
    return_agent,
    patient,
    pharmacy,
):
    from django.contrib.auth.hashers import check_password

    from apps.delivery.services.return_credentials import issue_return_verification

    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=return_agent,
    )
    incident = DeliveryIncident.objects.create(
        order=order,
        agent=return_agent,
        reason=DeliveryIncidentReason.CUSTOMER_REFUSED,
        status=DeliveryIncidentStatus.RETURN_REQUIRED,
        reported_order_status=order.status,
    )

    issued = issue_return_verification(
        incident_id=incident.id,
    )

    verification = DeliveryVerification.objects.get(
        order=order,
        verification_type=DeliveryVerificationType.RETURN,
    )

    assert issued["verification"].id == verification.id
    assert issued["pin"].isdigit()
    assert len(issued["pin"]) == 6
    assert issued["qr_token"]
    assert issued["expires_at"] is not None

    assert verification.pin_hash != issued["pin"]
    assert verification.qr_token_hash != issued["qr_token"]
    assert check_password(
        issued["pin"],
        verification.pin_hash,
    )
    assert check_password(
        issued["qr_token"],
        verification.qr_token_hash,
    )


@pytest.mark.django_db
def test_issue_return_verification_for_returning_incident(
    return_agent,
    patient,
    pharmacy,
):
    from apps.delivery.services.return_credentials import issue_return_verification

    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=return_agent,
    )
    incident = _create_returning_incident(
        order=order,
        agent=return_agent,
    )

    issued = issue_return_verification(
        incident_id=incident.id,
    )

    assert issued["pin"].isdigit()
    assert len(issued["pin"]) == 6
    assert issued["qr_token"]

    assert DeliveryVerification.objects.filter(
        order=order,
        verification_type=DeliveryVerificationType.RETURN,
    ).exists()


@pytest.mark.django_db
def test_reissuing_return_verification_rotates_credentials_and_resets_state(
    monkeypatch,
    return_agent,
    patient,
    pharmacy,
):
    from django.contrib.auth.hashers import check_password

    from apps.delivery.services import return_credentials
    from apps.delivery.services.return_credentials import issue_return_verification

    pins = iter(("111111", "222222"))
    qr_tokens = iter(("return-qr-first", "return-qr-second"))

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
        agent=return_agent,
    )
    incident = _create_returning_incident(
        order=order,
        agent=return_agent,
    )

    first = issue_return_verification(
        incident_id=incident.id,
    )

    verification = DeliveryVerification.objects.get(
        order=order,
        verification_type=DeliveryVerificationType.RETURN,
    )
    verification.failed_attempts = 3
    verification.last_failed_at = timezone.now()
    verification.used_at = timezone.now()
    verification.verification_method = DeliveryVerificationMethod.PIN
    verification.verified_by = return_agent
    verification.verified_location = Point(
        -7.5898,
        33.5731,
        srid=4326,
    )
    verification.save()

    second = issue_return_verification(
        incident_id=incident.id,
    )

    verification.refresh_from_db()

    assert first["pin"] == "111111"
    assert first["qr_token"] == "return-qr-first"
    assert second["pin"] == "222222"
    assert second["qr_token"] == "return-qr-second"

    assert check_password(
        "222222",
        verification.pin_hash,
    )
    assert not check_password(
        "111111",
        verification.pin_hash,
    )
    assert check_password(
        "return-qr-second",
        verification.qr_token_hash,
    )
    assert not check_password(
        "return-qr-first",
        verification.qr_token_hash,
    )

    assert verification.failed_attempts == 0
    assert verification.last_failed_at is None
    assert verification.used_at is None
    assert verification.verification_method == ""
    assert verification.verified_by is None
    assert verification.verified_location is None


@pytest.mark.django_db
def test_issue_return_verification_rejects_wrong_incident_state(
    return_agent,
    patient,
    pharmacy,
):
    from apps.delivery.services.return_credentials import issue_return_verification

    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=return_agent,
    )
    incident = DeliveryIncident.objects.create(
        order=order,
        agent=return_agent,
        reason=DeliveryIncidentReason.CUSTOMER_REFUSED,
        status=DeliveryIncidentStatus.OPEN,
        reported_order_status=order.status,
    )

    with pytest.raises(
        ValidationError,
        match="Return verification can only be issued",
    ):
        issue_return_verification(
            incident_id=incident.id,
        )

    assert not DeliveryVerification.objects.filter(
        order=order,
        verification_type=DeliveryVerificationType.RETURN,
    ).exists()


@pytest.mark.django_db
def test_issue_return_verification_rejects_mismatched_incident_agent(
    return_agent,
    patient,
    pharmacy,
):
    from apps.delivery.services.return_credentials import issue_return_verification

    other_agent = _create_delivery_agent(
        phone="+212600870099",
        email="return.mismatch@example.com",
        cin="RT123499",
        first_name="Mismatch",
    )

    order = _create_order(
        patient=patient,
        pharmacy=pharmacy,
        agent=return_agent,
    )
    incident = DeliveryIncident.objects.create(
        order=order,
        agent=other_agent,
        reason=DeliveryIncidentReason.CUSTOMER_REFUSED,
        status=DeliveryIncidentStatus.RETURN_REQUIRED,
        reported_order_status=order.status,
    )

    with pytest.raises(
        ValidationError,
        match="incident agent does not match",
    ):
        issue_return_verification(
            incident_id=incident.id,
        )

    assert not DeliveryVerification.objects.filter(
        order=order,
        verification_type=DeliveryVerificationType.RETURN,
    ).exists()


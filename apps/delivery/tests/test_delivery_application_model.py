from datetime import date

import pytest
from django.contrib.auth import get_user_model
from django.db import IntegrityError

from apps.core.constants import UserRole
from apps.delivery.models import (
    DeliveryApplication,
    DeliveryApplicationStatus,
)


User = get_user_model()


def _create_delivery_user(*, phone, email, cin, first_name="Courier"):
    return User.objects.create_user(
        phone=phone,
        password="StrongPass123!",
        email=email,
        cin=cin,
        first_name=first_name,
        last_name="Applicant",
        date_of_birth=date(1995, 1, 1),
        gender="M",
        role=UserRole.DELIVERY,
        is_phone_verified=True,
    )


def _create_admin_user():
    return User.objects.create_user(
        phone="+212600880099",
        password="StrongPass123!",
        email="delivery.application.admin@example.com",
        cin="DA900099",
        first_name="Delivery",
        last_name="Admin",
        date_of_birth=date(1990, 1, 1),
        gender="M",
        role=UserRole.ADMIN,
        is_phone_verified=True,
    )


@pytest.mark.django_db
def test_delivery_application_defaults_to_pending():
    user = _create_delivery_user(
        phone="+212600880001",
        email="delivery.application.pending@example.com",
        cin="DA900001",
    )

    application = DeliveryApplication.objects.create(
        user=user,
    )

    assert application.status == DeliveryApplicationStatus.PENDING
    assert application.submitted_at is not None
    assert application.reviewed_at is None
    assert application.reviewed_by_id is None
    assert application.review_note == ""


@pytest.mark.django_db(transaction=True)
def test_delivery_user_can_have_only_one_pending_application():
    user = _create_delivery_user(
        phone="+212600880002",
        email="delivery.application.unique@example.com",
        cin="DA900002",
    )

    DeliveryApplication.objects.create(
        user=user,
    )

    with pytest.raises(IntegrityError):
        DeliveryApplication.objects.create(
            user=user,
        )


@pytest.mark.django_db
def test_delivery_user_can_have_application_history():
    user = _create_delivery_user(
        phone="+212600880005",
        email="delivery.application.history@example.com",
        cin="DA900005",
    )

    rejected = DeliveryApplication.objects.create(
        user=user,
        status=DeliveryApplicationStatus.REJECTED,
        review_note="First application rejected.",
    )
    pending = DeliveryApplication.objects.create(
        user=user,
    )

    applications = list(
        DeliveryApplication.objects
        .filter(user=user)
        .order_by("id")
    )

    assert applications == [
        rejected,
        pending,
    ]
    assert rejected.status == DeliveryApplicationStatus.REJECTED
    assert pending.status == DeliveryApplicationStatus.PENDING


@pytest.mark.django_db
def test_delivery_application_can_store_review_metadata():
    user = _create_delivery_user(
        phone="+212600880003",
        email="delivery.application.reviewed@example.com",
        cin="DA900003",
    )
    admin = _create_admin_user()

    application = DeliveryApplication.objects.create(
        user=user,
        status=DeliveryApplicationStatus.APPROVED,
        reviewed_by=admin,
        review_note="Identity reviewed and application approved.",
    )

    assert application.status == DeliveryApplicationStatus.APPROVED
    assert application.reviewed_by_id == admin.id
    assert application.review_note == (
        "Identity reviewed and application approved."
    )


@pytest.mark.django_db
def test_delivery_application_string_representation():
    user = _create_delivery_user(
        phone="+212600880004",
        email="delivery.application.string@example.com",
        cin="DA900004",
        first_name="String",
    )
    application = DeliveryApplication.objects.create(
        user=user,
    )

    value = str(application)

    assert f"Delivery application #{application.id}" in value
    assert user.full_name in value
    assert "Pending review" in value

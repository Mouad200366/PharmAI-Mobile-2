from datetime import date

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse

from apps.core.constants import UserRole
from apps.delivery.models import (
    DeliveryAgentProfile,
    DeliveryApplication,
    DeliveryApplicationStatus,
)


User = get_user_model()


def _create_user(
    *,
    phone,
    email,
    cin,
    role,
    first_name,
):
    return User.objects.create_user(
        phone=phone,
        password="StrongPass123!",
        email=email,
        cin=cin,
        first_name=first_name,
        last_name="ApplicationAPI",
        date_of_birth=date(1992, 1, 1),
        gender="M",
        role=role,
        is_phone_verified=True,
    )


@pytest.fixture
def application_api_admin(db):
    return _create_user(
        phone="+212600882001",
        email="application.api.admin@example.com",
        cin="AA920001",
        role=UserRole.ADMIN,
        first_name="ApplicationAdmin",
    )


@pytest.fixture
def application_api_agent(db):
    return _create_user(
        phone="+212600882002",
        email="application.api.agent@example.com",
        cin="AA920002",
        role=UserRole.DELIVERY,
        first_name="ApplicationAgent",
    )


@pytest.mark.django_db
def test_admin_can_approve_delivery_application(
    api_client,
    application_api_admin,
    application_api_agent,
):
    application = DeliveryApplication.objects.create(
        user=application_api_agent,
    )

    api_client.force_authenticate(
        user=application_api_admin,
    )

    response = api_client.post(
        reverse(
            "v1:delivery-application-approve",
            kwargs={"application_id": application.id},
        ),
        {
            "review_note": "  Approved after verification.  ",
        },
        format="json",
    )

    assert response.status_code == 200
    assert response.data["id"] == application.id
    assert response.data["user_id"] == application_api_agent.id
    assert response.data["full_name"] == application_api_agent.full_name
    assert response.data["status"] == DeliveryApplicationStatus.APPROVED
    assert response.data["review_note"] == "Approved after verification."
    assert response.data["reviewed_by_name"] == application_api_admin.full_name
    assert response.data["reviewed_at"] is not None

    application.refresh_from_db()
    profile = DeliveryAgentProfile.objects.get(
        user=application_api_agent,
    )

    assert application.status == DeliveryApplicationStatus.APPROVED
    assert application.reviewed_by_id == application_api_admin.id
    assert profile.approved_at is not None
    assert profile.can_work is True


@pytest.mark.django_db
def test_admin_can_reject_delivery_application(
    api_client,
    application_api_admin,
    application_api_agent,
):
    application = DeliveryApplication.objects.create(
        user=application_api_agent,
    )

    api_client.force_authenticate(
        user=application_api_admin,
    )

    response = api_client.post(
        reverse(
            "v1:delivery-application-reject",
            kwargs={"application_id": application.id},
        ),
        {
            "review_note": "  Verification requirements not satisfied.  ",
        },
        format="json",
    )

    assert response.status_code == 200
    assert response.data["status"] == DeliveryApplicationStatus.REJECTED
    assert response.data["review_note"] == (
        "Verification requirements not satisfied."
    )
    assert response.data["reviewed_by_name"] == application_api_admin.full_name

    application.refresh_from_db()

    assert application.status == DeliveryApplicationStatus.REJECTED
    assert application.reviewed_by_id == application_api_admin.id
    assert application.reviewed_at is not None
    assert not DeliveryAgentProfile.objects.filter(
        user=application_api_agent,
    ).exists()


@pytest.mark.django_db
def test_non_admin_cannot_review_delivery_application(
    api_client,
    application_api_agent,
):
    applicant = _create_user(
        phone="+212600882003",
        email="application.api.applicant@example.com",
        cin="AA920003",
        role=UserRole.DELIVERY,
        first_name="Applicant",
    )
    application = DeliveryApplication.objects.create(
        user=applicant,
    )

    api_client.force_authenticate(
        user=application_api_agent,
    )

    response = api_client.post(
        reverse(
            "v1:delivery-application-approve",
            kwargs={"application_id": application.id},
        ),
        {
            "review_note": "Not authorized.",
        },
        format="json",
    )

    assert response.status_code == 403

    application.refresh_from_db()

    assert application.status == DeliveryApplicationStatus.PENDING
    assert application.reviewed_at is None
    assert application.reviewed_by_id is None
    assert not DeliveryAgentProfile.objects.filter(
        user=applicant,
    ).exists()


@pytest.mark.django_db
def test_approved_application_cannot_be_rejected_again_via_api(
    api_client,
    application_api_admin,
    application_api_agent,
):
    application = DeliveryApplication.objects.create(
        user=application_api_agent,
    )

    api_client.force_authenticate(
        user=application_api_admin,
    )

    approve_response = api_client.post(
        reverse(
            "v1:delivery-application-approve",
            kwargs={"application_id": application.id},
        ),
        {},
        format="json",
    )

    assert approve_response.status_code == 200

    reject_response = api_client.post(
        reverse(
            "v1:delivery-application-reject",
            kwargs={"application_id": application.id},
        ),
        {
            "review_note": "Attempted second review.",
        },
        format="json",
    )

    assert reject_response.status_code == 400

    application.refresh_from_db()
    profile = DeliveryAgentProfile.objects.get(
        user=application_api_agent,
    )

    assert application.status == DeliveryApplicationStatus.APPROVED
    assert profile.approved_at is not None
    assert profile.can_work is True

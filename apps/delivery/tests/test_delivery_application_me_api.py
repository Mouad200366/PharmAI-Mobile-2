from datetime import date

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone

from apps.core.constants import UserRole
from apps.delivery.models import (
    DeliveryAgentProfile,
    DeliveryApplication,
    DeliveryApplicationStatus,
)
from apps.delivery.services.application_review import (
    approve_delivery_application,
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
        last_name="ApplicationMe",
        date_of_birth=date(1994, 1, 1),
        gender="M",
        role=role,
        is_phone_verified=True,
    )


@pytest.fixture
def application_me_agent(db):
    return _create_user(
        phone="+212600883001",
        email="application.me.agent@example.com",
        cin="AM930001",
        role=UserRole.DELIVERY,
        first_name="ApplicationMeAgent",
    )


@pytest.fixture
def application_me_admin(db):
    return _create_user(
        phone="+212600883002",
        email="application.me.admin@example.com",
        cin="AM930002",
        role=UserRole.ADMIN,
        first_name="ApplicationMeAdmin",
    )


@pytest.mark.django_db
def test_delivery_user_gets_null_before_submitting_application(
    api_client,
    application_me_agent,
):
    api_client.force_authenticate(
        user=application_me_agent,
    )

    response = api_client.get(
        reverse("v1:delivery-application-me"),
    )

    assert response.status_code == 200
    assert response.data == {
        "application": None,
    }
    assert not DeliveryApplication.objects.filter(
        user=application_me_agent,
    ).exists()
    assert not DeliveryAgentProfile.objects.filter(
        user=application_me_agent,
    ).exists()


@pytest.mark.django_db
def test_delivery_user_can_submit_application(
    api_client,
    application_me_agent,
):
    api_client.force_authenticate(
        user=application_me_agent,
    )

    response = api_client.post(
        reverse("v1:delivery-application-me"),
        {},
        format="json",
    )

    assert response.status_code == 201

    application = DeliveryApplication.objects.get(
        user=application_me_agent,
    )

    assert response.data["application"]["id"] == application.id
    assert (
        response.data["application"]["status"]
        == DeliveryApplicationStatus.PENDING
    )
    assert (
        response.data["application"]["user_id"]
        == application_me_agent.id
    )
    assert (
        response.data["application"]["full_name"]
        == application_me_agent.full_name
    )
    assert response.data["application"]["reviewed_at"] is None

    assert not DeliveryAgentProfile.objects.filter(
        user=application_me_agent,
    ).exists()


@pytest.mark.django_db
def test_repeated_delivery_application_submission_is_idempotent(
    api_client,
    application_me_agent,
):
    api_client.force_authenticate(
        user=application_me_agent,
    )

    first_response = api_client.post(
        reverse("v1:delivery-application-me"),
        {},
        format="json",
    )
    second_response = api_client.post(
        reverse("v1:delivery-application-me"),
        {},
        format="json",
    )

    assert first_response.status_code == 201
    assert second_response.status_code == 200

    assert (
        first_response.data["application"]["id"]
        == second_response.data["application"]["id"]
    )
    assert DeliveryApplication.objects.filter(
        user=application_me_agent,
    ).count() == 1


@pytest.mark.django_db
def test_non_delivery_user_cannot_use_delivery_application_endpoint(
    api_client,
    patient,
):
    api_client.force_authenticate(
        user=patient,
    )

    get_response = api_client.get(
        reverse("v1:delivery-application-me"),
    )
    post_response = api_client.post(
        reverse("v1:delivery-application-me"),
        {},
        format="json",
    )

    assert get_response.status_code == 403
    assert post_response.status_code == 403

    assert not DeliveryApplication.objects.filter(
        user=patient,
    ).exists()


@pytest.mark.django_db
def test_delivery_user_can_see_approved_application_status(
    api_client,
    application_me_agent,
    application_me_admin,
):
    application = DeliveryApplication.objects.create(
        user=application_me_agent,
    )

    approve_delivery_application(
        application_id=application.id,
        reviewer=application_me_admin,
        review_note="Approved for deliveries.",
    )

    api_client.force_authenticate(
        user=application_me_agent,
    )

    response = api_client.get(
        reverse("v1:delivery-application-me"),
    )

    assert response.status_code == 200
    assert (
        response.data["application"]["status"]
        == DeliveryApplicationStatus.APPROVED
    )
    assert (
        response.data["application"]["review_note"]
        == "Approved for deliveries."
    )
    assert (
        response.data["application"]["reviewed_by_name"]
        == application_me_admin.full_name
    )
    assert response.data["application"]["reviewed_at"] is not None

    profile = DeliveryAgentProfile.objects.get(
        user=application_me_agent,
    )

    assert profile.approved_at is not None
    assert profile.can_work is True

@pytest.mark.django_db
def test_rejected_delivery_user_can_resubmit_with_new_application(
    api_client,
    application_me_agent,
):
    rejected = DeliveryApplication.objects.create(
        user=application_me_agent,
        status=DeliveryApplicationStatus.REJECTED,
        reviewed_at=timezone.now(),
        review_note="Initial application rejected.",
    )

    api_client.force_authenticate(
        user=application_me_agent,
    )

    response = api_client.post(
        reverse("v1:delivery-application-me"),
        {},
        format="json",
    )

    assert response.status_code == 201

    new_application_id = response.data["application"]["id"]

    assert new_application_id != rejected.id
    assert (
        response.data["application"]["status"]
        == DeliveryApplicationStatus.PENDING
    )

    rejected.refresh_from_db()

    assert rejected.status == DeliveryApplicationStatus.REJECTED
    assert rejected.review_note == "Initial application rejected."

    applications = DeliveryApplication.objects.filter(
        user=application_me_agent,
    )

    assert applications.count() == 2
    assert applications.filter(
        status=DeliveryApplicationStatus.REJECTED,
    ).count() == 1
    assert applications.filter(
        status=DeliveryApplicationStatus.PENDING,
    ).count() == 1


@pytest.mark.django_db
def test_approved_delivery_user_cannot_create_another_application(
    api_client,
    application_me_agent,
    application_me_admin,
):
    approved = DeliveryApplication.objects.create(
        user=application_me_agent,
    )

    approve_delivery_application(
        application_id=approved.id,
        reviewer=application_me_admin,
        review_note="Approved.",
    )

    api_client.force_authenticate(
        user=application_me_agent,
    )

    response = api_client.post(
        reverse("v1:delivery-application-me"),
        {},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["application"]["id"] == approved.id
    assert (
        response.data["application"]["status"]
        == DeliveryApplicationStatus.APPROVED
    )

    assert DeliveryApplication.objects.filter(
        user=application_me_agent,
    ).count() == 1

@pytest.mark.django_db(transaction=True)
def test_concurrent_delivery_application_submissions_are_serialized(
    application_me_agent,
):
    from threading import Barrier
    from concurrent.futures import ThreadPoolExecutor

    from django.db import close_old_connections
    from rest_framework.test import APIClient

    barrier = Barrier(2)
    url = reverse("v1:delivery-application-me")

    def submit_application():
        close_old_connections()

        client = APIClient()
        client.force_authenticate(
            user=application_me_agent,
        )

        barrier.wait()

        try:
            response = client.post(
                url,
                {},
                format="json",
            )
            return (
                response.status_code,
                response.data["application"]["id"],
            )
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(
            executor.map(
                lambda _: submit_application(),
                range(2),
            )
        )

    status_codes = sorted(
        status_code
        for status_code, _ in results
    )
    application_ids = {
        application_id
        for _, application_id in results
    }

    assert status_codes == [200, 201]
    assert len(application_ids) == 1

    pending_applications = DeliveryApplication.objects.filter(
        user=application_me_agent,
        status=DeliveryApplicationStatus.PENDING,
    )

    assert pending_applications.count() == 1
    assert pending_applications.first().id in application_ids


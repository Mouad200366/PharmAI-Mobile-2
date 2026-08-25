from datetime import date, timedelta

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone

from apps.core.constants import UserRole
from apps.delivery.models import (
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
        last_name="ApplicationQueue",
        date_of_birth=date(1991, 1, 1),
        gender="M",
        role=role,
        is_phone_verified=True,
    )


@pytest.fixture
def queue_admin(db):
    return _create_user(
        phone="+212600884001",
        email="application.queue.admin@example.com",
        cin="AQ940001",
        role=UserRole.ADMIN,
        first_name="QueueAdmin",
    )


@pytest.fixture
def queue_agent(db):
    return _create_user(
        phone="+212600884002",
        email="application.queue.agent@example.com",
        cin="AQ940002",
        role=UserRole.DELIVERY,
        first_name="QueueAgent",
    )


@pytest.mark.django_db
def test_pending_application_queue_filters_and_orders_oldest_first(
    api_client,
    queue_admin,
):
    older_agent = _create_user(
        phone="+212600884010",
        email="application.queue.older@example.com",
        cin="AQ940010",
        role=UserRole.DELIVERY,
        first_name="Older",
    )
    newer_agent = _create_user(
        phone="+212600884011",
        email="application.queue.newer@example.com",
        cin="AQ940011",
        role=UserRole.DELIVERY,
        first_name="Newer",
    )
    approved_agent = _create_user(
        phone="+212600884012",
        email="application.queue.approved@example.com",
        cin="AQ940012",
        role=UserRole.DELIVERY,
        first_name="Approved",
    )
    rejected_agent = _create_user(
        phone="+212600884013",
        email="application.queue.rejected@example.com",
        cin="AQ940013",
        role=UserRole.DELIVERY,
        first_name="Rejected",
    )

    older = DeliveryApplication.objects.create(
        user=older_agent,
    )
    newer = DeliveryApplication.objects.create(
        user=newer_agent,
    )
    approved = DeliveryApplication.objects.create(
        user=approved_agent,
        status=DeliveryApplicationStatus.APPROVED,
    )
    rejected = DeliveryApplication.objects.create(
        user=rejected_agent,
        status=DeliveryApplicationStatus.REJECTED,
    )

    now = timezone.now()
    DeliveryApplication.objects.filter(pk=older.pk).update(
        submitted_at=now - timedelta(hours=2),
    )
    DeliveryApplication.objects.filter(pk=newer.pk).update(
        submitted_at=now - timedelta(hours=1),
    )
    DeliveryApplication.objects.filter(pk=approved.pk).update(
        submitted_at=now - timedelta(hours=4),
    )
    DeliveryApplication.objects.filter(pk=rejected.pk).update(
        submitted_at=now - timedelta(hours=3),
    )

    api_client.force_authenticate(user=queue_admin)

    response = api_client.get(
        reverse("v1:delivery-application-pending-list"),
    )

    assert response.status_code == 200

    applications = response.data["applications"]

    assert [item["id"] for item in applications] == [
        older.id,
        newer.id,
    ]
    assert all(
        item["status"] == DeliveryApplicationStatus.PENDING
        for item in applications
    )


@pytest.mark.django_db
def test_admin_can_get_delivery_application_detail(
    api_client,
    queue_admin,
    queue_agent,
):
    application = DeliveryApplication.objects.create(
        user=queue_agent,
    )

    api_client.force_authenticate(user=queue_admin)

    response = api_client.get(
        reverse(
            "v1:delivery-application-detail",
            kwargs={"application_id": application.id},
        ),
    )

    assert response.status_code == 200
    assert response.data["id"] == application.id
    assert response.data["user_id"] == queue_agent.id
    assert response.data["full_name"] == queue_agent.full_name
    assert response.data["status"] == DeliveryApplicationStatus.PENDING


@pytest.mark.django_db
def test_missing_delivery_application_detail_returns_404(
    api_client,
    queue_admin,
):
    api_client.force_authenticate(user=queue_admin)

    response = api_client.get(
        reverse(
            "v1:delivery-application-detail",
            kwargs={"application_id": 999999},
        ),
    )

    assert response.status_code == 404


@pytest.mark.django_db
def test_non_admin_cannot_view_pending_application_queue(
    api_client,
    queue_agent,
):
    api_client.force_authenticate(user=queue_agent)

    response = api_client.get(
        reverse("v1:delivery-application-pending-list"),
    )

    assert response.status_code == 403


@pytest.mark.django_db
def test_non_admin_cannot_view_delivery_application_detail(
    api_client,
    queue_agent,
):
    applicant = _create_user(
        phone="+212600884020",
        email="application.queue.detail@example.com",
        cin="AQ940020",
        role=UserRole.DELIVERY,
        first_name="DetailApplicant",
    )
    application = DeliveryApplication.objects.create(
        user=applicant,
    )

    api_client.force_authenticate(user=queue_agent)

    response = api_client.get(
        reverse(
            "v1:delivery-application-detail",
            kwargs={"application_id": application.id},
        ),
    )

    assert response.status_code == 403

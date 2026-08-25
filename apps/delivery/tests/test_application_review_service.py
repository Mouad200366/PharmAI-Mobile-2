from datetime import date

import pytest
from django.contrib.auth import get_user_model
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.core.constants import UserRole
from apps.delivery.models import (
    DeliveryAgentProfile,
    DeliveryApplication,
    DeliveryApplicationStatus,
)
from apps.delivery.services.application_review import (
    approve_delivery_application,
    reject_delivery_application,
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
        last_name="ApplicationReview",
        date_of_birth=date(1992, 1, 1),
        gender="M",
        role=role,
        is_phone_verified=True,
    )


@pytest.fixture
def review_admin(db):
    return _create_user(
        phone="+212600881001",
        email="application.review.admin@example.com",
        cin="AR910001",
        role=UserRole.ADMIN,
        first_name="ReviewAdmin",
    )


@pytest.fixture
def review_agent(db):
    return _create_user(
        phone="+212600881002",
        email="application.review.agent@example.com",
        cin="AR910002",
        role=UserRole.DELIVERY,
        first_name="ReviewAgent",
    )


@pytest.mark.django_db
def test_approve_delivery_application_grants_work_eligibility(
    review_admin,
    review_agent,
):
    application = DeliveryApplication.objects.create(
        user=review_agent,
    )

    approved = approve_delivery_application(
        application_id=application.id,
        reviewer=review_admin,
        review_note="  Identity verified and approved.  ",
    )

    approved.refresh_from_db()
    profile = DeliveryAgentProfile.objects.get(
        user=review_agent,
    )

    assert approved.status == DeliveryApplicationStatus.APPROVED
    assert approved.reviewed_by_id == review_admin.id
    assert approved.reviewed_at is not None
    assert approved.review_note == "Identity verified and approved."

    assert profile.approved_at is not None
    assert profile.can_work is True


@pytest.mark.django_db
def test_reject_delivery_application_does_not_grant_work_eligibility(
    review_admin,
    review_agent,
):
    application = DeliveryApplication.objects.create(
        user=review_agent,
    )

    rejected = reject_delivery_application(
        application_id=application.id,
        reviewer=review_admin,
        review_note="  Required verification was not satisfied.  ",
    )

    rejected.refresh_from_db()

    assert rejected.status == DeliveryApplicationStatus.REJECTED
    assert rejected.reviewed_by_id == review_admin.id
    assert rejected.reviewed_at is not None
    assert rejected.review_note == (
        "Required verification was not satisfied."
    )
    assert not DeliveryAgentProfile.objects.filter(
        user=review_agent,
    ).exists()


@pytest.mark.django_db
def test_non_admin_cannot_review_delivery_application(
    review_agent,
):
    other_agent = _create_user(
        phone="+212600881003",
        email="application.review.other@example.com",
        cin="AR910003",
        role=UserRole.DELIVERY,
        first_name="OtherAgent",
    )
    application = DeliveryApplication.objects.create(
        user=review_agent,
    )

    with pytest.raises(PermissionDenied):
        approve_delivery_application(
            application_id=application.id,
            reviewer=other_agent,
        )

    application.refresh_from_db()

    assert application.status == DeliveryApplicationStatus.PENDING
    assert application.reviewed_at is None
    assert application.reviewed_by_id is None
    assert not DeliveryAgentProfile.objects.filter(
        user=review_agent,
    ).exists()


@pytest.mark.django_db
def test_reviewed_application_cannot_be_reviewed_again(
    review_admin,
    review_agent,
):
    application = DeliveryApplication.objects.create(
        user=review_agent,
    )

    approve_delivery_application(
        application_id=application.id,
        reviewer=review_admin,
    )

    with pytest.raises(
        ValidationError,
        match="Only a pending delivery application can be reviewed",
    ):
        reject_delivery_application(
            application_id=application.id,
            reviewer=review_admin,
        )

    application.refresh_from_db()
    profile = DeliveryAgentProfile.objects.get(
        user=review_agent,
    )

    assert application.status == DeliveryApplicationStatus.APPROVED
    assert profile.approved_at is not None
    assert profile.can_work is True

@pytest.mark.django_db(transaction=True)
def test_concurrent_admin_reviews_allow_only_one_final_decision():
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier

    from django.db import close_old_connections, connection

    applicant = _create_user(
        phone="+212600881010",
        email="application.review.concurrent.agent@example.com",
        cin="AR910010",
        role=UserRole.DELIVERY,
        first_name="ConcurrentAgent",
    )
    approve_admin = _create_user(
        phone="+212600881011",
        email="application.review.concurrent.approve@example.com",
        cin="AR910011",
        role=UserRole.ADMIN,
        first_name="ApproveAdmin",
    )
    reject_admin = _create_user(
        phone="+212600881012",
        email="application.review.concurrent.reject@example.com",
        cin="AR910012",
        role=UserRole.ADMIN,
        first_name="RejectAdmin",
    )

    application = DeliveryApplication.objects.create(
        user=applicant,
    )

    barrier = Barrier(2)

    def approve():
        close_old_connections()
        barrier.wait()

        try:
            result = approve_delivery_application(
                application_id=application.id,
                reviewer=approve_admin,
                review_note="Concurrent approval.",
            )
            return (
                "approved",
                result.status,
            )
        except ValidationError:
            return (
                "rejected_by_lock",
                None,
            )
        finally:
            connection.close()

    def reject():
        close_old_connections()
        barrier.wait()

        try:
            result = reject_delivery_application(
                application_id=application.id,
                reviewer=reject_admin,
                review_note="Concurrent rejection.",
            )
            return (
                "rejected",
                result.status,
            )
        except ValidationError:
            return (
                "rejected_by_lock",
                None,
            )
        finally:
            connection.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        approve_future = executor.submit(approve)
        reject_future = executor.submit(reject)

        results = [
            approve_future.result(),
            reject_future.result(),
        ]

    successful_results = [
        result
        for result in results
        if result[0] in {"approved", "rejected"}
    ]
    blocked_results = [
        result
        for result in results
        if result[0] == "rejected_by_lock"
    ]

    assert len(successful_results) == 1
    assert len(blocked_results) == 1

    application.refresh_from_db()

    assert application.status in (
        DeliveryApplicationStatus.APPROVED,
        DeliveryApplicationStatus.REJECTED,
    )
    assert application.reviewed_at is not None
    assert application.reviewed_by_id in {
        approve_admin.id,
        reject_admin.id,
    }

    if application.status == DeliveryApplicationStatus.APPROVED:
        profile = DeliveryAgentProfile.objects.get(
            user=applicant,
        )
        assert profile.approved_at is not None
        assert profile.can_work is True
        assert application.reviewed_by_id == approve_admin.id
        assert application.review_note == "Concurrent approval."
    else:
        assert not DeliveryAgentProfile.objects.filter(
            user=applicant,
        ).exists()
        assert application.reviewed_by_id == reject_admin.id
        assert application.review_note == "Concurrent rejection."


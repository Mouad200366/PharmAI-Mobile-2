from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.core.constants import UserRole
from apps.delivery.models import (
    DeliveryAgentProfile,
    DeliveryApplication,
    DeliveryApplicationStatus,
)


def _require_admin_reviewer(reviewer):
    if reviewer is None or reviewer.role != UserRole.ADMIN:
        raise PermissionDenied(
            "Only an administrator can review delivery applications."
        )


def _get_locked_pending_application(*, application_id):
    application = (
        DeliveryApplication.objects
        .select_for_update()
        .select_related("user")
        .filter(pk=application_id)
        .first()
    )

    if application is None:
        raise ValidationError("Delivery application not found.")

    if application.status != DeliveryApplicationStatus.PENDING:
        raise ValidationError(
            "Only a pending delivery application can be reviewed."
        )

    return application


def approve_delivery_application(
    *,
    application_id,
    reviewer,
    review_note="",
):
    """Approve a pending courier application and grant work eligibility."""
    _require_admin_reviewer(reviewer)

    with transaction.atomic():
        application = _get_locked_pending_application(
            application_id=application_id,
        )

        profile = (
            DeliveryAgentProfile.objects
            .select_for_update()
            .filter(user_id=application.user_id)
            .first()
        )

        if profile is None:
            profile = DeliveryAgentProfile.objects.create(
                user_id=application.user_id,
            )

        now = timezone.now()

        profile.approved_at = now
        profile.save(
            update_fields=(
                "approved_at",
                "updated_at",
            ),
        )

        application.status = DeliveryApplicationStatus.APPROVED
        application.reviewed_at = now
        application.reviewed_by = reviewer
        application.review_note = (review_note or "").strip()
        application.save(
            update_fields=(
                "status",
                "reviewed_at",
                "reviewed_by",
                "review_note",
                "updated_at",
            ),
        )

    return application


def reject_delivery_application(
    *,
    application_id,
    reviewer,
    review_note="",
):
    """Reject a pending courier application without granting work eligibility."""
    _require_admin_reviewer(reviewer)

    with transaction.atomic():
        application = _get_locked_pending_application(
            application_id=application_id,
        )

        profile = (
            DeliveryAgentProfile.objects
            .select_for_update()
            .filter(user_id=application.user_id)
            .first()
        )

        if profile is not None and profile.approved_at is not None:
            raise ValidationError(
                "An already approved delivery agent cannot be rejected "
                "through the application review workflow."
            )

        now = timezone.now()

        application.status = DeliveryApplicationStatus.REJECTED
        application.reviewed_at = now
        application.reviewed_by = reviewer
        application.review_note = (review_note or "").strip()
        application.save(
            update_fields=(
                "status",
                "reviewed_at",
                "reviewed_by",
                "review_note",
                "updated_at",
            ),
        )

    return application

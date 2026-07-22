from .models import AuditLog


def log_audit(*, actor, action: str, target, **metadata) -> AuditLog:
    """Single chokepoint for writing AuditLog rows.

    `actor` may be `None` for system events (Stripe webhook, Celery tasks).
    `target` is any Django model instance; we record its class name and PK.
    """
    return AuditLog.objects.create(
        actor=actor if actor is not None and getattr(actor, 'is_authenticated', False) else None,
        action=action,
        target_type=type(target).__name__,
        target_id=str(target.pk),
        metadata=metadata,
    )

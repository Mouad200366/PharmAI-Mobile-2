from .models import Notification


def notify(*, user, type: str, title: str = '', body: str = '', **payload) -> Notification:
    """Single helper for creating in-app notifications.

    Future enhancement: fan out to push/email by reading user preferences
    here. Keeping all creation routed through this function makes that
    one-place change.
    """
    return Notification.objects.create(
        user=user,
        type=type,
        title=title,
        body=body,
        payload=payload,
    )

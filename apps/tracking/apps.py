from django.apps import AppConfig


class TrackingConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.tracking'
    label = 'tracking'

    def ready(self):
        # Hook order status changes → websocket broadcast.
        from . import signals  # noqa: F401

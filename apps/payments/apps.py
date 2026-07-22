from django.apps import AppConfig


class PaymentsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.payments'
    label = 'payments'

    def ready(self):
        # Hook the post_save signal that auto-marks cash payments paid on delivery.
        from . import signals  # noqa: F401

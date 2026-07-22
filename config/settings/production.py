import sentry_sdk
from decouple import Csv, config
from sentry_sdk.integrations.celery import CeleryIntegration
from sentry_sdk.integrations.django import DjangoIntegration
from sentry_sdk.integrations.logging import LoggingIntegration

from .base import *  # noqa: F401,F403
from .base import LOGGING, REST_FRAMEWORK

DEBUG = False
ALLOWED_HOSTS = config('ALLOWED_HOSTS', cast=Csv())

SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

REST_FRAMEWORK['DEFAULT_THROTTLE_CLASSES'] = (
    'rest_framework.throttling.ScopedRateThrottle',
    'rest_framework.throttling.AnonRateThrottle',
    'rest_framework.throttling.UserRateThrottle',
)
# Defaults for the new throttle classes — without these, DRF errors on first hit.
REST_FRAMEWORK.setdefault('DEFAULT_THROTTLE_RATES', {})
REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'].setdefault('anon', '120/min')
REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'].setdefault('user', '600/min')

# --- Structured logging --------------------------------------------------
# Switch the root handler to JSON output so log aggregators get one parseable
# event per line. The 'plain' formatter stays available for libraries that
# bypass the root logger.
LOGGING['root']['handlers'] = ['console_json']

# --- Sentry --------------------------------------------------------------
SENTRY_DSN = config('SENTRY_DSN', default='')
if SENTRY_DSN:
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        integrations=[
            DjangoIntegration(),
            CeleryIntegration(),
            # Capture WARNING+ as breadcrumbs and ERROR+ as Sentry events.
            LoggingIntegration(level=None, event_level='ERROR'),
        ],
        environment=config('SENTRY_ENVIRONMENT', default='production'),
        release=config('SENTRY_RELEASE', default=''),
        traces_sample_rate=config('SENTRY_TRACES_SAMPLE_RATE', default=0.05, cast=float),
        send_default_pii=False,
    )

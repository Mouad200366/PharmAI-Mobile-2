import os
import sys
from datetime import timedelta
from pathlib import Path

import dj_database_url
from decouple import Csv, config

BASE_DIR = Path(__file__).resolve().parent.parent.parent

# GDAL / GEOS bootstrap for Windows local dev (OSGeo4W).
# On Linux/Docker, GDAL is installed system-wide and Django finds it automatically;
# this block is a no-op there. OSGEO4W_ROOT can be overridden via env.
_OSGEO4W_ROOT = config('OSGEO4W_ROOT', default='')
if sys.platform == 'win32' and _OSGEO4W_ROOT and os.path.isdir(_OSGEO4W_ROOT):
    _osgeo_bin = os.path.join(_OSGEO4W_ROOT, 'bin')
    _proj_lib = os.path.join(_OSGEO4W_ROOT, 'share', 'proj')
    if os.path.isdir(_osgeo_bin):
        os.add_dll_directory(_osgeo_bin)
        os.environ['PATH'] = _osgeo_bin + os.pathsep + os.environ.get('PATH', '')
        # Auto-detect whichever gdal*.dll OSGeo4W installed (version varies by release).
        import glob as _glob
        _gdal_dlls = sorted(_glob.glob(os.path.join(_osgeo_bin, 'gdal*.dll')), reverse=True)
        if _gdal_dlls:
            GDAL_LIBRARY_PATH = _gdal_dlls[0]
        GEOS_LIBRARY_PATH = os.path.join(_osgeo_bin, 'geos_c.dll')
    if os.path.isdir(_proj_lib):
        os.environ.setdefault('PROJ_LIB', _proj_lib)

SECRET_KEY = config('SECRET_KEY', default='dev-only-change-me')
DEBUG = config('DEBUG', default=False, cast=bool)
ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='localhost,127.0.0.1', cast=Csv())

INSTALLED_APPS = [
    # Daphne must come before django.contrib.staticfiles per Channels docs.
    'daphne',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'django.contrib.gis',
    'django.contrib.postgres',

    'channels',
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'django_filters',
    'phonenumber_field',
    'drf_spectacular',

    'apps.core',
    'apps.users',
    'apps.authentication',
    'apps.addresses',
    'apps.catalog',
    'apps.pharmacies',
    'apps.search',
    'apps.delivery',
    'apps.orders',
    'apps.payments',
    'apps.tracking',
    'apps.notifications',
    'apps.audit',
    'apps.analytics',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'
WSGI_APPLICATION = 'config.wsgi.application'
ASGI_APPLICATION = 'config.asgi.application'

# Channels treats this as the canonical entrypoint when daphne runs.

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

DATABASES = {
    'default': dj_database_url.parse(
        config(
            'DATABASE_URL',
            default='postgres://pharmacy_user:pharmacy_pass@localhost:5432/pharmacy_db',
        ),
        conn_max_age=600,
    )
}
DATABASES['default']['ENGINE'] = 'django.contrib.gis.db.backends.postgis'

AUTH_USER_MODEL = 'users.User'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
     'OPTIONS': {'min_length': 8}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Africa/Casablanca'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_PAGINATION_CLASS': 'apps.core.pagination.DefaultPagination',
    'DEFAULT_FILTER_BACKENDS': (
        'django_filters.rest_framework.DjangoFilterBackend',
    ),
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'EXCEPTION_HANDLER': 'apps.core.exceptions.custom_exception_handler',
    'DEFAULT_THROTTLE_CLASSES': (
        'rest_framework.throttling.ScopedRateThrottle',
    ),
    'DEFAULT_THROTTLE_RATES': {
        'otp_request': '5/min',
        'login': '10/min',
        'search': '60/min',
        'order_create': '10/hour',
    },
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(
        minutes=config('JWT_ACCESS_TOKEN_LIFETIME_MINUTES', default=60, cast=int),
    ),
    'REFRESH_TOKEN_LIFETIME': timedelta(
        days=config('JWT_REFRESH_TOKEN_LIFETIME_DAYS', default=7, cast=int),
    ),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
}

SPECTACULAR_SETTINGS = {
    'TITLE': 'PharmaAi API',
    'DESCRIPTION': 'Patient ordering API for Moroccan pharmacies.',
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
}

PHONENUMBER_DEFAULT_REGION = 'MA'
PHONENUMBER_DEFAULT_FORMAT = 'E164'

# WhatsApp Cloud API (Meta) — leave blank in dev to fall back to console logging.
WHATSAPP_PHONE_ID = config('WHATSAPP_PHONE_ID', default='')
WHATSAPP_TOKEN = config('WHATSAPP_TOKEN', default='')

OTP_LENGTH = 6
OTP_EXPIRY_MINUTES = 10
OTP_MAX_ATTEMPTS = 5
OTP_RESEND_COOLDOWN_SECONDS = 60

CORS_ALLOWED_ORIGINS = config(
    'CORS_ALLOWED_ORIGINS',
    default='http://localhost:3000',
    cast=Csv(),
)

# Stripe — leave blank in dev unless you're testing card flows.
# Get keys from https://dashboard.stripe.com/test/apikeys
STRIPE_SECRET_KEY = config('STRIPE_SECRET_KEY', default='')
STRIPE_PUBLISHABLE_KEY = config('STRIPE_PUBLISHABLE_KEY', default='')
STRIPE_WEBHOOK_SECRET = config('STRIPE_WEBHOOK_SECRET', default='')
STRIPE_CURRENCY = config('STRIPE_CURRENCY', default='MAD')

# --- Channels (Phase 6) ---
# Redis address: docker compose maps the container's 6379 → host 6380.
REDIS_HOST = config('REDIS_HOST', default='127.0.0.1')
REDIS_PORT = config('REDIS_PORT', default=6381, cast=int)

CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            'hosts': [
                {
                    'host': REDIS_HOST,
                    'port': REDIS_PORT,
                    'socket_timeout': 10,
                    'socket_connect_timeout': 5,
                },
            ],
        },
    },
}

# --- Celery (Phase 6) ---
CELERY_BROKER_URL = config(
    'CELERY_BROKER_URL', default=f'redis://{REDIS_HOST}:{REDIS_PORT}/0',
)
CELERY_RESULT_BACKEND = config('CELERY_RESULT_BACKEND', default='')
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_ALWAYS_EAGER = config('CELERY_TASK_ALWAYS_EAGER', default=False, cast=bool)
CELERY_BEAT_SCHEDULE = {
    'mark-stale-agents-offline': {
        'task': 'apps.delivery.tasks.mark_stale_agents_offline',
        'schedule': 60.0,  # every minute
    },
    'retry-stuck-orders': {
        'task': 'apps.orders.tasks.retry_stuck_orders',
        'schedule': 30.0,  # every 30 seconds
    },
}

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'plain': {
            'format': '%(asctime)s [%(levelname)s] %(name)s: %(message)s',
        },
        'json': {
            # Production JSON formatter — one line per record, easy to ship to
            # Loki/CloudWatch/Datadog. production.py switches to this handler.
            '()': 'pythonjsonlogger.json.JsonFormatter',
            'fmt': '%(asctime)s %(name)s %(levelname)s %(message)s %(pathname)s %(lineno)d',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'plain',
        },
        'console_json': {
            'class': 'logging.StreamHandler',
            'formatter': 'json',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
    'loggers': {
        # Quiet a few noisy libraries.
        'django.db.backends': {'level': 'WARNING'},
        'urllib3': {'level': 'WARNING'},
    },
}

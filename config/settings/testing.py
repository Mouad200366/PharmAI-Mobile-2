from .base import *  # noqa: F401,F403
from .base import REST_FRAMEWORK

DEBUG = False
SECRET_KEY = 'test-secret-key-with-at-least-32-bytes'

PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']

REST_FRAMEWORK['DEFAULT_THROTTLE_CLASSES'] = ()
REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'] = {
    'otp_request': '1000/min',
    'login': '1000/min',
    'search': '1000/min',
    'order_create': '1000/min',
}

# Run Celery tasks synchronously and skip the broker entirely.
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True

# In-memory channel layer so tests don't need Redis.
CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels.layers.InMemoryChannelLayer',
    },
}

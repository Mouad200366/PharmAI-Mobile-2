import os

from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.development')

app = Celery('pharmaai')

# Load CELERY_* settings from Django.
app.config_from_object('django.conf:settings', namespace='CELERY')

# Auto-discover tasks.py in every installed app.
app.autodiscover_tasks()

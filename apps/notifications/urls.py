from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register(r'', views.NotificationViewSet, basename='notification')

urlpatterns = [
    path(
        'devices/register/',
        views.UserDeviceRegisterView.as_view(),
        name='user-device-register',
    ),
    path(
        'devices/deactivate/',
        views.UserDeviceDeactivateView.as_view(),
        name='user-device-deactivate',
    ),
    path('', include(router.urls)),
]

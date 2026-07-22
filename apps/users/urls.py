from django.urls import path

from . import views

urlpatterns = [
    path('me/', views.MeView.as_view(), name='me'),
    path('password/change/', views.PasswordChangeView.as_view(), name='password-change'),
    path('password/reset/', views.PasswordResetView.as_view(), name='password-reset'),
]

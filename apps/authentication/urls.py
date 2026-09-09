from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from . import views

urlpatterns = [
    path('signup/', views.SignUpView.as_view(), name='signup'),
    path('request-otp/', views.RequestOTPView.as_view(), name='request-otp'),
    path('verify-otp/', views.VerifyOTPView.as_view(), name='verify-otp'),
    path('login/', views.LoginView.as_view(), name='login'),
    path('logout/', views.LogoutView.as_view(), name='logout'),
    path('refresh/', TokenRefreshView.as_view(), name='token-refresh'),
    path(
    'pharmacist-signup/',
    views.PharmacistSignUpView.as_view(),
    name='pharmacist-signup',
),
path(
    'pharmacist-login/',
    views.PharmacistLoginView.as_view(),
    name='pharmacist-login',
),
]

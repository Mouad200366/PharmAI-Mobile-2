from django.urls import path

from . import views

urlpatterns = [
    path('intent/', views.PaymentIntentView.as_view(), name='payment-intent'),
    path('webhook/', views.StripeWebhookView.as_view(), name='payment-webhook'),
    path('<int:order_id>/', views.PaymentDetailView.as_view(), name='payment-detail'),
]

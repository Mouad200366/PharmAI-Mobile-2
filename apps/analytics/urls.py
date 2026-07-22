from django.urls import path

from . import views

urlpatterns = [
    path('orders/', views.OrderStatsView.as_view(), name='stats-orders'),
    path('pharmacies/', views.PharmacyStatsView.as_view(), name='stats-pharmacies'),
    path('agents/', views.AgentStatsView.as_view(), name='stats-agents'),
    path('medicines/', views.MedicineStatsView.as_view(), name='stats-medicines'),
]

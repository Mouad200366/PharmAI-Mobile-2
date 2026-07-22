from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register(r'pharmacies', views.PharmacyViewSet, basename='pharmacy')
router.register(r'stock', views.PharmacyStockViewSet, basename='pharmacy-stock')
router.register(r'night-shifts', views.NightShiftViewSet, basename='night-shift')

urlpatterns = [
    path('pharmacies/open-now/', views.OpenPharmaciesView.as_view(), name='pharmacies-open-now'),
    path('pharmacies/<int:pk>/is_open/', views.PharmacyIsOpenView.as_view(), name='pharmacy-is-open'),
    path('', include(router.urls)),
]

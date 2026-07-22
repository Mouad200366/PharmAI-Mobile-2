from django.urls import path

from .views import MedicineSearchView

urlpatterns = [
    path('', MedicineSearchView.as_view(), name='search'),
]

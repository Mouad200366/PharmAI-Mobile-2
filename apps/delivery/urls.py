from django.urls import path

from . import views

urlpatterns = [
    path('me/', views.MeView.as_view(), name='delivery-me'),
    path('online/', views.OnlineView.as_view(), name='delivery-online'),
    path('location/', views.LocationView.as_view(), name='delivery-location'),
]

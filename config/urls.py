from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from apps.core.views import healthz

# All public API routes are versioned. Bumping the prefix is a breaking change;
# add /api/v2/ alongside (don't replace) when introducing one.
api_v1 = [
    path('auth/', include('apps.authentication.urls')),
    path('users/', include('apps.users.urls')),
    path('addresses/', include('apps.addresses.urls')),
    path('medicines/', include('apps.catalog.urls')),
    path('', include('apps.pharmacies.urls')),
    path('search/', include('apps.search.urls')),
    path('orders/', include('apps.orders.urls')),
    path('delivery/', include('apps.delivery.urls')),
    path('payments/', include('apps.payments.urls')),
    path('notifications/', include('apps.notifications.urls')),
    path('admin/stats/', include('apps.analytics.urls')),
]

urlpatterns = [
    path('healthz/', healthz, name='healthz'),
    path('admin/', admin.site.urls),
    path('api/v1/', include((api_v1, 'v1'))),
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
]

if settings.DEBUG:
    try:
        import debug_toolbar
        urlpatterns += [path('__debug__/', include(debug_toolbar.urls))]
    except ImportError:
        pass
    # Only needed in dev -- in production, media files are served by
    # nginx/whatever's in front of Django, not by Django itself.
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
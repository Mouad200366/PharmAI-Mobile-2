from django.contrib.gis import admin as gis_admin

from .models import DeliveryAgentProfile


@gis_admin.register(DeliveryAgentProfile)
class DeliveryAgentProfileAdmin(gis_admin.GISModelAdmin):
    list_display = ('user', 'is_online', 'location_updated_at')
    list_filter = ('is_online',)
    search_fields = ('user__phone',)
    raw_id_fields = ('user',)

from django.contrib import admin

from .models import Medicine


@admin.register(Medicine)
class MedicineAdmin(admin.ModelAdmin):
    list_display = ('name', 'generic_name', 'manufacturer', 'requires_prescription', 'is_active')
    list_filter = ('requires_prescription', 'is_active')
    search_fields = ('name', 'generic_name', 'manufacturer')
    ordering = ('name',)

from django.contrib import admin

from .models import OTPCode


@admin.register(OTPCode)
class OTPCodeAdmin(admin.ModelAdmin):
    list_display = (
        'phone', 'purpose', 'code', 'is_used',
        'attempts', 'created_at', 'expires_at',
    )
    list_filter = ('purpose', 'is_used')
    search_fields = ('phone',)
    readonly_fields = ('created_at',)

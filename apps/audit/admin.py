from django.contrib import admin

from .models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ('id', 'actor', 'action', 'target_type', 'target_id', 'created_at')
    list_filter = ('action', 'target_type')
    search_fields = ('actor__phone', 'target_id')
    readonly_fields = ('actor', 'action', 'target_type', 'target_id', 'metadata', 'created_at')
    date_hierarchy = 'created_at'

    def has_add_permission(self, request):
        return False  # Audit log is append-only via service.

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

from django.contrib import admin

from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'type', 'title', 'created_at', 'read_at')
    list_filter = ('type',)
    search_fields = ('user__phone', 'title', 'body')
    raw_id_fields = ('user',)
    readonly_fields = ('payload', 'created_at', 'updated_at')

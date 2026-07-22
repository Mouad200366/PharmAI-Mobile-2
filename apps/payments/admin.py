from django.contrib import admin

from .models import Payment, ProcessedStripeEvent


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ('id', 'order', 'provider', 'status', 'amount', 'currency', 'paid_at')
    list_filter = ('provider', 'status', 'currency')
    search_fields = ('provider_payment_id', 'order__id', 'order__customer__phone')
    raw_id_fields = ('order',)
    readonly_fields = ('raw_last_event', 'created_at', 'updated_at')


@admin.register(ProcessedStripeEvent)
class ProcessedStripeEventAdmin(admin.ModelAdmin):
    list_display = ('event_id', 'event_type', 'processed_at')
    list_filter = ('event_type',)
    search_fields = ('event_id',)
    readonly_fields = ('event_id', 'event_type', 'processed_at')

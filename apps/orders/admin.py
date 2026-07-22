from django.contrib import admin
from django.contrib.gis import admin as gis_admin
from django.utils.translation import gettext_lazy as _

from .models import Order, OrderItem, Prescription


@admin.action(description=_('Force-cancel selected orders (refunds payment + stock)'))
def bulk_force_cancel(modeladmin, request, queryset):
    from apps.audit.services import log_audit
    from apps.payments.services.refund import refund_order
    cancelled = 0
    for order in queryset:
        try:
            refund_order(order, reason='admin_force_cancel', actor=request.user)
            log_audit(actor=request.user, action='force_cancel_order', target=order)
            cancelled += 1
        except Exception as exc:  # noqa: BLE001 — admin action; surface to user
            modeladmin.message_user(
                request, f'Order #{order.id} skipped: {exc}', level='warning',
            )
    modeladmin.message_user(request, f'{cancelled} order(s) cancelled.')


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = ('medicine', 'quantity', 'unit_price')


class PrescriptionInline(admin.StackedInline):
    model = Prescription
    extra = 0
    readonly_fields = ('verified_by', 'verified_at')
    can_delete = False


@gis_admin.register(Order)
class OrderAdmin(gis_admin.GISModelAdmin):
    list_display = ('id', 'customer', 'pharmacy', 'status', 'grand_total', 'created_at')
    list_filter = ('status', 'prescription_mode', 'payment_method')
    search_fields = ('customer__phone', 'pharmacy__name', 'delivery_address')
    raw_id_fields = ('customer', 'pharmacy', 'delivery_agent')
    date_hierarchy = 'created_at'
    inlines = (OrderItemInline, PrescriptionInline)
    actions = (bulk_force_cancel,)


@admin.register(Prescription)
class PrescriptionAdmin(admin.ModelAdmin):
    list_display = ('order', 'status', 'verified_by', 'verified_at')
    list_filter = ('status',)
    raw_id_fields = ('order', 'verified_by')

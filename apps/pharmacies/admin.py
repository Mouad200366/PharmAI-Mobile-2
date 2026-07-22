from django.contrib import admin
from django.contrib.gis import admin as gis_admin
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from .models import NightShift, Pharmacy, PharmacyStock


@admin.action(description=_('Verify selected pharmacies'))
def bulk_verify_pharmacies(modeladmin, request, queryset):
    from apps.audit.services import log_audit
    updated = queryset.filter(is_verified=False).update(is_verified=True)
    for pharmacy in queryset:
        log_audit(actor=request.user, action='verify_pharmacy', target=pharmacy, bulk=True)
    modeladmin.message_user(request, f'{updated} pharmacy(ies) verified.')


@gis_admin.register(Pharmacy)
class PharmacyAdmin(gis_admin.GISModelAdmin):
    list_display = ('name', 'owner', 'license_number', 'is_active', 'is_verified')
    list_filter = ('is_active', 'is_verified')
    search_fields = ('name', 'license_number', 'address', 'owner__phone')
    raw_id_fields = ('owner',)
    actions = (bulk_verify_pharmacies,)


@admin.register(PharmacyStock)
class PharmacyStockAdmin(admin.ModelAdmin):
    list_display = ('pharmacy', 'medicine', 'price', 'quantity', 'is_available')
    list_filter = ('is_available',)
    search_fields = ('pharmacy__name', 'medicine__name')
    raw_id_fields = ('pharmacy', 'medicine')


class ActiveNowFilter(admin.SimpleListFilter):
    title = _('active now')
    parameter_name = 'active_now'

    def lookups(self, request, model_admin):
        return (('1', _('Active now')), ('0', _('Not active')))

    def queryset(self, request, queryset):
        now = timezone.now()
        if self.value() == '1':
            return queryset.filter(starts_at__lte=now, ends_at__gte=now)
        if self.value() == '0':
            return queryset.exclude(starts_at__lte=now, ends_at__gte=now)
        return queryset


@admin.register(NightShift)
class NightShiftAdmin(admin.ModelAdmin):
    list_display = ('pharmacy', 'starts_at', 'ends_at', 'is_active_now')
    list_filter = (ActiveNowFilter, 'pharmacy')
    search_fields = ('pharmacy__name', 'notes')
    raw_id_fields = ('pharmacy',)
    date_hierarchy = 'starts_at'
    ordering = ('-starts_at',)

    @admin.display(boolean=True, description=_('active now'))
    def is_active_now(self, obj):
        now = timezone.now()
        return obj.starts_at <= now <= obj.ends_at

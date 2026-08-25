from django.contrib import admin, messages
from django.contrib.gis import admin as gis_admin
from rest_framework.exceptions import ValidationError

from .models import (
    CashSettlement,
    CashSettlementStatus,
    DeliveryAgentProfile,
)
from .services.cash_settlements import complete_cash_settlement


@gis_admin.register(DeliveryAgentProfile)
class DeliveryAgentProfileAdmin(gis_admin.GISModelAdmin):
    list_display = (
        'user',
        'is_online',
        'location_updated_at',
    )
    list_filter = ('is_online',)
    search_fields = ('user__phone',)
    raw_id_fields = ('user',)


@admin.register(CashSettlement)
class CashSettlementAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'agent',
        'amount',
        'currency',
        'status',
        'created_at',
        'completed_at',
    )

    list_filter = (
        'status',
        'currency',
        'created_at',
    )

    search_fields = (
        'agent__phone',
        'note',
    )

    raw_id_fields = ('agent',)

    ordering = (
        '-created_at',
        '-id',
    )

    actions = (
        'complete_selected_settlements',
    )

    def get_readonly_fields(self, request, obj=None):
        if obj is None:
            return (
                'status',
                'completed_at',
            )

        if obj.status != CashSettlementStatus.PENDING:
            return (
                'agent',
                'amount',
                'currency',
                'status',
                'completed_at',
                'created_at',
                'updated_at',
            )

        return (
            'status',
            'completed_at',
            'created_at',
            'updated_at',
        )

    @admin.action(
        description='Confirmer les règlements espèces sélectionnés',
    )
    def complete_selected_settlements(
        self,
        request,
        queryset,
    ):
        completed_count = 0
        failed_count = 0

        for settlement in queryset.order_by('created_at', 'id'):
            try:
                complete_cash_settlement(
                    settlement_id=settlement.id,
                )
            except ValidationError as exc:
                failed_count += 1

                self.message_user(
                    request,
                    (
                        f'Règlement #{settlement.id} non confirmé : '
                        f'{exc.detail}'
                    ),
                    level=messages.ERROR,
                )
            else:
                completed_count += 1

        if completed_count:
            self.message_user(
                request,
                (
                    f'{completed_count} règlement(s) espèces '
                    'confirmé(s) avec succès.'
                ),
                level=messages.SUCCESS,
            )

        if failed_count:
            self.message_user(
                request,
                (
                    f'{failed_count} règlement(s) '
                    'n’ont pas pu être confirmés.'
                ),
                level=messages.WARNING,
            )
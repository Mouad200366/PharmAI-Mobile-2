from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    ordering = ('-date_joined',)
    list_display = (
        'phone', 'first_name', 'last_name', 'cin', 'role',
        'is_phone_verified', 'is_active',
    )
    list_filter = ('role', 'is_phone_verified', 'is_active', 'is_staff', 'gender')
    search_fields = ('phone', 'cin', 'first_name', 'last_name', 'email')
    fieldsets = (
        (None, {'fields': ('phone', 'password')}),
        ('Identity', {'fields': (
            'first_name', 'last_name', 'cin', 'email',
            'date_of_birth', 'gender', 'role',
        )}),
        ('Status', {'fields': (
            'is_phone_verified', 'is_active', 'is_staff', 'is_superuser',
            'groups', 'user_permissions',
        )}),
        ('Important dates', {'fields': ('last_login', 'date_joined')}),
    )
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': (
                'phone', 'cin', 'first_name', 'last_name',
                'date_of_birth', 'gender', 'role', 'password1', 'password2',
            ),
        }),
    )

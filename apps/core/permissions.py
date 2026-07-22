from rest_framework import permissions


class IsOwner(permissions.BasePermission):
    owner_field = 'user'

    def has_object_permission(self, request, view, obj):
        owner_id = getattr(obj, f'{self.owner_field}_id', None)
        if owner_id is not None:
            return owner_id == request.user.id
        return obj.pk == request.user.pk


class IsPhoneVerified(permissions.BasePermission):
    message = 'Phone number must be verified.'

    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and u.is_phone_verified)

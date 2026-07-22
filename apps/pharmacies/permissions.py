from rest_framework import permissions


class IsPharmacyOwner(permissions.BasePermission):
    """SAFE methods are open; writes require the requester to own the pharmacy."""

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        pharmacy = obj if hasattr(obj, 'owner_id') else obj.pharmacy
        return pharmacy.owner_id == request.user.id

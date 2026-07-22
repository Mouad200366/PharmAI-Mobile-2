from rest_framework import permissions


class IsOrderCustomer(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        return obj.customer_id == request.user.id


class IsOrderPharmacy(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        return obj.pharmacy is not None and obj.pharmacy.owner_id == request.user.id


class IsOrderDeliveryAgent(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        return obj.delivery_agent_id == request.user.id

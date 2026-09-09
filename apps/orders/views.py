from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .constants import OrderStatus, PrescriptionStatus
from .models import Order
from .permissions import IsOrderCustomer, IsOrderDeliveryAgent, IsOrderPharmacy
from .serializers import (
    AdminOrderSerializer,
    AgentOrderSerializer,
    ChatMessageSerializer,
    CustomerOrderSerializer,
    OrderCreateSerializer,
    PharmacyOrderSerializer,
    PrescriptionVerifySerializer,
    StatusTransitionSerializer,
)
from .services.place_order import _try_assign_agent, place_order
from .services.state_machine import ACTIVE_AGENT_STATUSES, transition


def _serializer_for(user):
    if user.is_staff:
        return AdminOrderSerializer
    if user.is_pharmacist:
        return PharmacyOrderSerializer
    if user.is_delivery:
        return AgentOrderSerializer
    return CustomerOrderSerializer


class OrderViewSet(viewsets.GenericViewSet):
    """Single viewset that scopes by role. Each role has its own serializer
    and queryset slice — see `_serializer_for` / `get_queryset`."""

    permission_classes = (permissions.IsAuthenticated,)
    parser_classes = (JSONParser, FormParser, MultiPartParser)

    def get_queryset(self):
        user = self.request.user
        base = Order.objects.select_related(
            'customer', 'pharmacy', 'delivery_agent',
        ).prefetch_related(
            'items__medicine',
            'prescription',
            'delivery_incidents',
        )
        if user.is_staff:
            return base
        if user.is_pharmacist:
            return base.filter(pharmacy__owner=user)
        if user.is_delivery:
            return base.filter(delivery_agent=user)
        return base.filter(customer=user)

    def get_serializer_class(self):
        return _serializer_for(self.request.user)

    # --- Customer-facing ---

    def list(self, request):
        qs = self.get_queryset()
        serializer = self.get_serializer_class()(qs, many=True)
        return Response(serializer.data)

    def retrieve(self, request, pk=None):
        order = get_object_or_404(self.get_queryset(), pk=pk)
        return Response(self.get_serializer_class()(order).data)

    def get_throttles(self):
        if self.action in ('create', 'reorder'):
            self.throttle_scope = 'order_create'
            return [ScopedRateThrottle()]
        return super().get_throttles()

    def create(self, request):
        if not request.user.is_patient:
            raise PermissionDenied('Only patients may place orders.')

        serializer = OrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        d = serializer.validated_data

        order = place_order(
            customer=request.user,
            items=d['items'],
            delivery_address=d['delivery_address'],
            latitude=d['latitude'],
            longitude=d['longitude'],
            prescription_mode=d['prescription_mode'],
            payment_method=d['payment_method'],
            prescription_photo=d.get('prescription_photo'),
            notes=d.get('notes', ''),
        )

        return Response(
            CustomerOrderSerializer(order).data,
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=True,
        methods=('post',),
        permission_classes=(permissions.IsAuthenticated, IsOrderCustomer),
    )
    def reorder(self, request, pk=None):
        original = get_object_or_404(self.get_queryset(), pk=pk)
        self.check_object_permissions(request, original)

        items = [
            {
                'medicine': item.medicine_id,
                'quantity': item.quantity,
            }
            for item in original.items.all()
        ]

        new_order = place_order(
            customer=request.user,
            items=items,
            delivery_address=request.data.get(
                'delivery_address',
                original.delivery_address,
            ),
            latitude=float(
                request.data.get(
                    'latitude',
                    original.delivery_location.y,
                )
            ),
            longitude=float(
                request.data.get(
                    'longitude',
                    original.delivery_location.x,
                )
            ),
            prescription_mode=request.data.get(
                'prescription_mode',
                original.prescription_mode,
            ),
            payment_method=request.data.get(
                'payment_method',
                original.payment_method,
            ),
            prescription_photo=request.data.get(
                'prescription_photo',
            ),
        )

        return Response(
            CustomerOrderSerializer(new_order).data,
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=True,
        methods=('post',),
        permission_classes=(
            permissions.IsAuthenticated,
            IsOrderCustomer,
        ),
    )
    def cancel(self, request, pk=None):
        from apps.payments.services.refund import refund_order

        order = get_object_or_404(
            self.get_queryset(),
            pk=pk,
        )

        self.check_object_permissions(
            request,
            order,
        )

        cancellable = {
            OrderStatus.PENDING_PAYMENT,
            OrderStatus.PENDING_REVIEW,
            OrderStatus.ACCEPTED,
            OrderStatus.PREPARING,
        }

        if order.status not in cancellable:
            raise ValidationError(
                'This order can no longer be cancelled.'
            )

        refund_order(
            order,
            reason='customer_cancellation',
            actor=request.user,
        )

        return Response(
            CustomerOrderSerializer(order).data
        )

    # --- Pharmacy-facing ---

    @action(
        detail=False,
        methods=('get',),
    )
    def queue(self, request):
        if not request.user.is_pharmacist:
            raise PermissionDenied(
                'Pharmacy queue is for pharmacist accounts.'
            )

        active = (
            OrderStatus.PENDING_REVIEW,
            OrderStatus.ACCEPTED,
            OrderStatus.PREPARING,
            OrderStatus.READY_FOR_PICKUP,
            OrderStatus.AWAITING_AGENT,
        )

        qs = (
            self.get_queryset()
            .filter(status__in=active)
            .order_by('created_at')
        )

        return Response(
            PharmacyOrderSerializer(
                qs,
                many=True,
            ).data
        )

    @action(
        detail=True,
        methods=('post',),
        url_path='verify_prescription',
        permission_classes=(
            permissions.IsAuthenticated,
            IsOrderPharmacy,
        ),
    )
    def verify_prescription(
        self,
        request,
        pk=None,
    ):
        from apps.audit.services import log_audit
        from apps.payments.services.refund import refund_order

        order = get_object_or_404(
            self.get_queryset(),
            pk=pk,
        )

        self.check_object_permissions(
            request,
            order,
        )

        if (
            order.prescription_mode.lower() != 'photo'
            or not hasattr(order, 'prescription')
        ):
            raise ValidationError(
                'No photo prescription to review.'
            )

        if order.status != OrderStatus.PENDING_REVIEW:
            raise ValidationError(
                'Prescription is not pending review.'
            )

        body = PrescriptionVerifySerializer(
            data=request.data
        )
        body.is_valid(raise_exception=True)

        approve = body.validated_data['approve']
        prescription = order.prescription

        with transaction.atomic():
            prescription.verified_by = request.user
            prescription.verified_at = timezone.now()

            if approve:
                prescription.status = PrescriptionStatus.APPROVED
                prescription.save()

                transition(
                    order,
                    OrderStatus.ACCEPTED,
                    by_user=request.user,
                )

                _try_assign_agent(order)

                log_audit(
                    actor=request.user,
                    action='approve_prescription',
                    target=order,
                )

            else:
                prescription.status = PrescriptionStatus.REJECTED
                prescription.rejection_reason = (
                    body.validated_data.get(
                        'rejection_reason',
                        '',
                    )
                )
                prescription.save()

                transition(
                    order,
                    OrderStatus.REJECTED,
                    by_user=request.user,
                )

                refund_order(
                    order,
                    reason='prescription_rejected',
                    actor=request.user,
                )

                log_audit(
                    actor=request.user,
                    action='reject_prescription',
                    target=order,
                    reason=body.validated_data.get(
                        'rejection_reason',
                        '',
                    ),
                )

        return Response(
            PharmacyOrderSerializer(order).data
        )

    @action(
        detail=True,
        methods=('post',),
        url_path='pharmacy/scan',
        permission_classes=(
            permissions.IsAuthenticated,
            IsOrderPharmacy,
        ),
    )
    def pharmacy_scan(
        self,
        request,
        pk=None,
    ):
        from django.db.models import F

        from apps.catalog.models import Medicine

        from .models import OrderItem

        barcode = str(
            request.data.get(
                'barcode',
                '',
            )
        ).strip()

        if not barcode:
            raise ValidationError(
                {
                    'barcode':
                        'Barcode is required.'
                }
            )

        with transaction.atomic():
            order = get_object_or_404(
                self.get_queryset()
                .select_for_update(
                    of=('self',)
                ),
                pk=pk,
            )

            self.check_object_permissions(
                request,
                order,
            )

            if order.status not in (
                OrderStatus.ACCEPTED,
                OrderStatus.PREPARING,
            ):
                raise ValidationError(
                    'Medicines can only be scanned for accepted or preparing orders.'
                )

            medicine = (
                Medicine.objects
                .filter(
                    barcode=barcode,
                    is_active=True,
                )
                .first()
            )

            if medicine is None:
                raise ValidationError(
                    {
                        'barcode':
                            'Unknown medicine barcode.'
                    }
                )

            item = (
                OrderItem.objects
                .select_for_update()
                .filter(
                    order=order,
                    medicine=medicine,
                )
                .first()
            )

            if item is None:
                raise ValidationError(
                    {
                        'barcode':
                            'This medicine is not part of the order.'
                    }
                )

            if (
                item.scanned_quantity
                >= item.quantity
            ):
                raise ValidationError(
                    {
                        'barcode':
                            'The requested quantity for this medicine is already complete.'
                    }
                )

            if order.status == OrderStatus.ACCEPTED:
                transition(
                    order,
                    OrderStatus.PREPARING,
                    by_user=request.user,
                )

            item.scanned_quantity += 1

            item.save(
                update_fields=(
                    'scanned_quantity',
                    'updated_at',
                )
            )

            all_items_scanned = (
                not OrderItem.objects.filter(
                    order=order,
                    scanned_quantity__lt=F(
                        'quantity'
                    ),
                ).exists()
            )

            if all_items_scanned:
                transition(
                    order,
                    OrderStatus.READY_FOR_PICKUP,
                    by_user=request.user,
                )

                transition(
                    order,
                    OrderStatus.AWAITING_AGENT,
                    by_user=request.user,
                )

                if order.delivery_agent_id is None:
                    _try_assign_agent(order)

            progress_items = list(
                OrderItem.objects
                .filter(order=order)
                .select_related('medicine')
                .order_by('id')
            )

        scanned = sum(
            item.scanned_quantity
            for item in progress_items
        )

        required = sum(
            item.quantity
            for item in progress_items
        )

        percentage = (
            round(
                (scanned * 100) / required
            )
            if required
            else 0
        )

        return Response(
            {
                'success': True,
                'message': (
                    'Order ready; delivery-agent search started.'
                    if all_items_scanned
                    else 'Medicine validated.'
                ),
                'orderId': order.id,
                'orderStatus': order.status,
                'scannedMedicineId': medicine.id,
                'scannedMedicineName': medicine.name,
                'barcode': barcode,
                'progress': {
                    'scanned': scanned,
                    'required': required,
                    'percentage': percentage,
                },
                'items': [
                    {
                        'orderItemId': item.id,
                        'medicineId': item.medicine_id,
                        'medicineName': item.medicine.name,
                        'quantity': item.quantity,
                        'scannedQuantity':
                            item.scanned_quantity,
                        'complete':
                            item.scanned_quantity
                            >= item.quantity,
                    }
                    for item in progress_items
                ],
            },
            status=status.HTTP_200_OK,
        )

    @action(
        detail=True,
        methods=('post',),
        url_path='pharmacy/pickup-verification',
        permission_classes=(
            permissions.IsAuthenticated,
            IsOrderPharmacy,
        ),
    )
    def pharmacy_pickup_verification(
        self,
        request,
        pk=None,
    ):
        from apps.delivery.services.pickup import (
            issue_pickup_verification,
        )

        order = get_object_or_404(
            self.get_queryset(),
            pk=pk,
        )

        self.check_object_permissions(
            request,
            order,
        )

        issued = issue_pickup_verification(
            order=order,
        )

        return Response(
            {
                'order_id': order.id,
                'qr_token': issued['qr_token'],
                'pin': issued['pin'],
                'expires_at': issued['expires_at'],
            },
            status=status.HTTP_200_OK,
        )

    @action(
        detail=True,
        methods=('get',),
    )
    def messages(
        self,
        request,
        pk=None,
    ):
        order = get_object_or_404(
            self.get_queryset(),
            pk=pk,
        )

        if not (
            request.user.is_staff
            or order.customer_id == request.user.id
            or order.delivery_agent_id == request.user.id
        ):
            raise PermissionDenied(
                'Order chat is only available to the customer and assigned delivery agent.'
            )

        qs = (
            order.messages
            .select_related('sender')
            .order_by('created_at')
        )

        return Response(
            ChatMessageSerializer(
                qs,
                many=True,
            ).data
        )

    # --- Delivery-agent-facing ---

    @action(
        detail=False,
        methods=('get',),
    )
    def active(
        self,
        request,
    ):
        if not request.user.is_delivery:
            raise PermissionDenied(
                'Active order is for delivery accounts.'
            )

        order = (
            self.get_queryset()
            .filter(
                status__in=ACTIVE_AGENT_STATUSES
            )
            .first()
        )

        if order is None:
            return Response(None)

        return Response(
            AgentOrderSerializer(order).data
        )

    @action(
        detail=False,
        methods=('get',),
    )
    def history(
        self,
        request,
    ):
        if not request.user.is_delivery:
            raise PermissionDenied(
                'History is for delivery accounts.'
            )

        terminal = (
            OrderStatus.DELIVERED,
            OrderStatus.FAILED,
            OrderStatus.CANCELLED,
        )

        qs = (
            self.get_queryset()
            .filter(status__in=terminal)
            .order_by('-created_at')
        )

        return Response(
            AgentOrderSerializer(
                qs,
                many=True,
            ).data
        )

    @action(
        detail=True,
        methods=('post',),
        url_path='delivery/pickup/verify',
        permission_classes=(
            permissions.IsAuthenticated,
            IsOrderDeliveryAgent,
        ),
    )
    def verify_pickup(
        self,
        request,
        pk=None,
    ):
        from apps.delivery.pickup_serializers import (
            PickupVerificationRequestSerializer,
        )
        from apps.delivery.services.pickup import (
            verify_pickup,
        )

        order = get_object_or_404(
            self.get_queryset(),
            pk=pk,
        )

        self.check_object_permissions(
            request,
            order,
        )

        body = (
            PickupVerificationRequestSerializer(
                data=request.data
            )
        )
        body.is_valid(
            raise_exception=True
        )

        verify_pickup(
            order_id=order.id,
            agent=request.user,
            method=body.validated_data['method'],
            credential=body.validated_data['credential'],
            latitude=body.validated_data['latitude'],
            longitude=body.validated_data['longitude'],
        )

        order.refresh_from_db()

        return Response(
            AgentOrderSerializer(order).data,
            status=status.HTTP_200_OK,
        )

    @action(
        detail=True,
        methods=('post',),
        url_path='delivery/start',
        permission_classes=(
            permissions.IsAuthenticated,
            IsOrderDeliveryAgent,
        ),
    )
    def start_delivery(
        self,
        request,
        pk=None,
    ):
        from apps.delivery.services.start_delivery import (
            start_delivery as start_delivery_service,
        )

        order = get_object_or_404(
            self.get_queryset(),
            pk=pk,
        )

        self.check_object_permissions(
            request,
            order,
        )

        order = start_delivery_service(
            order_id=order.id,
            agent=request.user,
        )

        order.refresh_from_db()

        return Response(
            AgentOrderSerializer(order).data,
            status=status.HTTP_200_OK,
        )

    @action(
        detail=True,
        methods=('post',),
        url_path='delivery/complete',
        permission_classes=(
            permissions.IsAuthenticated,
            IsOrderDeliveryAgent,
        ),
    )
    def complete_delivery(
        self,
        request,
        pk=None,
    ):
        from apps.delivery.delivery_completion_serializers import (
            DeliveryCompletionRequestSerializer,
        )
        from apps.delivery.services.delivery_proof import (
            complete_delivery as complete_delivery_service,
        )

        order = get_object_or_404(
            self.get_queryset(),
            pk=pk,
        )

        self.check_object_permissions(
            request,
            order,
        )

        serializer = (
            DeliveryCompletionRequestSerializer(
                data=request.data
            )
        )
        serializer.is_valid(
            raise_exception=True
        )

        order = complete_delivery_service(
            order_id=order.id,
            agent=request.user,
            pin=serializer.validated_data['pin'],
            latitude=serializer.validated_data['latitude'],
            longitude=serializer.validated_data['longitude'],
            cash_confirmed=serializer.validated_data[
                'cash_confirmed'
            ],
        )

        order.refresh_from_db()

        return Response(
            AgentOrderSerializer(order).data,
            status=status.HTTP_200_OK,
        )

    @action(
        detail=True,
        methods=('post',),
        url_path='advance_status',
        permission_classes=(
            permissions.IsAuthenticated,
            IsOrderDeliveryAgent,
        ),
    )
    def advance_status(
        self,
        request,
        pk=None,
    ):
        order = get_object_or_404(
            self.get_queryset(),
            pk=pk,
        )

        self.check_object_permissions(
            request,
            order,
        )

        body = StatusTransitionSerializer(
            data=request.data
        )
        body.is_valid(
            raise_exception=True
        )

        transition(
            order,
            body.validated_data['status'],
            by_user=request.user,
        )

        return Response(
            AgentOrderSerializer(order).data
        )

    # --- Admin ---

    @action(
        detail=True,
        methods=('post',),
        url_path='force_assign_agent',
    )
    def force_assign_agent(
        self,
        request,
        pk=None,
    ):
        from apps.audit.services import log_audit
        from apps.users.models import User

        if not request.user.is_staff:
            raise PermissionDenied(
                'Admin only.'
            )

        order = get_object_or_404(
            Order.objects.all(),
            pk=pk,
        )

        agent_id = request.data.get(
            'agent_id'
        )

        if not agent_id:
            raise ValidationError(
                {
                    'agent_id':
                        'Required.'
                }
            )

        try:
            agent = User.objects.get(
                pk=agent_id,
                role='delivery',
            )
        except User.DoesNotExist as exc:
            raise ValidationError(
                {
                    'agent_id':
                        'No such delivery user.'
                }
            ) from exc

        previous = order.delivery_agent_id

        order.delivery_agent = agent
        order.save(
            update_fields=(
                'delivery_agent',
                'updated_at',
            )
        )

        log_audit(
            actor=request.user,
            action='force_assign_agent',
            target=order,
            previous_agent_id=previous,
            new_agent_id=agent.id,
        )

        return Response(
            AdminOrderSerializer(order).data
        )


class PharmacyAdvanceStatusView(APIView):
    """POST /api/orders/{id}/pharmacy_advance/ — pharmacy moves order forward."""

    permission_classes = (
        permissions.IsAuthenticated,
        IsOrderPharmacy,
    )

    def post(
        self,
        request,
        pk,
    ):
        order = get_object_or_404(
            Order.objects.all(),
            pk=pk,
        )

        self.check_object_permissions(
            request,
            order,
        )

        body = StatusTransitionSerializer(
            data=request.data
        )
        body.is_valid(
            raise_exception=True
        )

        new_status = (
            body.validated_data['status']
        )

        with transaction.atomic():
            transition(
                order,
                new_status,
                by_user=request.user,
            )

            if (
                new_status
                == OrderStatus.AWAITING_AGENT
                and order.delivery_agent_id
                is None
            ):
                _try_assign_agent(order)

        return Response(
            PharmacyOrderSerializer(order).data
        )
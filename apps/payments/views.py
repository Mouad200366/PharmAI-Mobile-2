from django.conf import settings
from rest_framework import permissions, status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.orders.models import Order

from .constants import PaymentProvider, PaymentStatus
from .models import Payment
from .serializers import (
    PaymentIntentRequestSerializer,
    PaymentSerializer,
)
from .services import stripe_service
from .services.webhook import handle_stripe_event


class PaymentIntentView(APIView):
    """POST /api/payments/intent/  body: {order_id}

    Creates (or retrieves) a Stripe PaymentIntent for a card-payment order.
    The customer's frontend confirms the intent client-side using the returned
    client_secret. The webhook then advances the order server-side.
    """

    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request):
        body = PaymentIntentRequestSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        order_id = body.validated_data['order_id']

        try:
            order = Order.objects.select_related('payment').get(pk=order_id)
        except Order.DoesNotExist as exc:
            raise NotFound('Order not found.') from exc
        if order.customer_id != request.user.id:
            raise PermissionDenied('Not your order.')

        try:
            payment = order.payment
        except Payment.DoesNotExist as exc:
            raise NotFound('Order has no payment record.') from exc
        if payment.provider != PaymentProvider.CARD:
            raise ValidationError('This order is not a card payment.')
        if payment.status == PaymentStatus.PAID:
            raise ValidationError('Already paid.')

        # Reuse the existing intent if it's still valid; create a new one if
        # we never made one or the previous attempt failed.
        if not payment.provider_payment_id or payment.status == PaymentStatus.FAILED:
            intent = stripe_service.create_payment_intent(payment)
        else:
            intent = stripe_service.retrieve_payment_intent(payment.provider_payment_id)

        return Response({
            'client_secret': intent.client_secret,
            'payment_intent_id': intent.id,
            'amount': str(payment.amount),
            'currency': payment.currency,
        })


class StripeWebhookView(APIView):
    """POST /api/payments/webhook/

    Public, signature-verified. Stripe pings this on every payment event;
    we only act on `payment_intent.succeeded` and `payment_intent.payment_failed`.
    """

    permission_classes = (permissions.AllowAny,)
    authentication_classes = ()

    def post(self, request):
        webhook_secret = settings.STRIPE_WEBHOOK_SECRET
        if not webhook_secret:
            return Response(
                {'error': 'webhook secret not configured'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        # Lazy import so the SDK isn't required at module load time.
        import stripe

        payload = request.body
        sig_header = request.headers.get('Stripe-Signature', '')

        try:
            event = stripe.Webhook.construct_event(
                payload, sig_header, webhook_secret,
            )
        except (ValueError, stripe.SignatureVerificationError):
            return Response(
                {'error': 'invalid signature'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        handle_stripe_event(event)
        return Response({'received': True}, status=status.HTTP_200_OK)


class PaymentDetailView(APIView):
    """GET /api/payments/{order_id}/  — read the payment record for one order."""

    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request, order_id):
        try:
            order = Order.objects.select_related('payment').get(pk=order_id)
        except Order.DoesNotExist as exc:
            raise NotFound() from exc
        if order.customer_id != request.user.id and not request.user.is_staff:
            raise PermissionDenied()
        try:
            payment = order.payment
        except Payment.DoesNotExist as exc:
            raise NotFound() from exc
        return Response(PaymentSerializer(payment).data)

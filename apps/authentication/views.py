from django.db import transaction

from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.notifications.services import deactivate_user_device

from .serializers import (
    LoginSerializer,
    LogoutSerializer,
    RequestOTPSerializer,
    SignUpSerializer,
    VerifyOTPSerializer,
)
from .throttles import LoginThrottle, OTPRequestThrottle


class SignUpView(generics.CreateAPIView):
    serializer_class = SignUpSerializer
    permission_classes = (permissions.AllowAny,)
    throttle_classes = (OTPRequestThrottle,)
    throttle_scope = 'otp_request'

    def create(self, request, *args, **kwargs):
        s = self.get_serializer(data=request.data)
        s.is_valid(raise_exception=True)
        s.save()
        return Response(
            {'detail': 'Signup successful. Verify phone via OTP.'},
            status=status.HTTP_201_CREATED,
        )


class RequestOTPView(APIView):
    permission_classes = (permissions.AllowAny,)
    throttle_classes = (OTPRequestThrottle,)
    throttle_scope = 'otp_request'

    def post(self, request):
        s = RequestOTPSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        return Response(s.save(), status=status.HTTP_200_OK)


class VerifyOTPView(APIView):
    permission_classes = (permissions.AllowAny,)

    def post(self, request):
        s = VerifyOTPSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        return Response(s.save(), status=status.HTTP_200_OK)


class LoginView(APIView):
    permission_classes = (permissions.AllowAny,)
    throttle_classes = (LoginThrottle,)
    throttle_scope = 'login'

    def post(self, request):
        s = LoginSerializer(data=request.data, context={'request': request})
        s.is_valid(raise_exception=True)
        return Response(s.validated_data, status=status.HTTP_200_OK)


class LogoutView(APIView):
    def post(self, request):
        s = LogoutSerializer(data=request.data)
        s.is_valid(raise_exception=True)

        if request.user.is_delivery:
            from apps.orders.models import Order
            from apps.orders.services.state_machine import ACTIVE_AGENT_STATUSES

            has_active_delivery = (
                Order.objects
                .filter(
                    delivery_agent=request.user,
                    status__in=ACTIVE_AGENT_STATUSES,
                )
                .exists()
            )

            if has_active_delivery:
                return Response(
                    {
                        'detail': (
                            'You cannot log out while you have an active delivery.'
                        ),
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

        with transaction.atomic():
            device_id = s.validated_data.get('device_id')

            if device_id:
                deactivate_user_device(
                    user=request.user,
                    device_id=device_id,
                )

            s.save()

        return Response(
            {'detail': 'Successfully logged out.'},
            status=status.HTTP_200_OK,
        )


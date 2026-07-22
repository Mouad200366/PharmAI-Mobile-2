from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import PasswordChangeSerializer, PasswordResetSerializer, UserSerializer


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user


class PasswordChangeView(APIView):
    def post(self, request):
        s = PasswordChangeSerializer(data=request.data, context={'request': request})
        s.is_valid(raise_exception=True)
        s.save()
        return Response({'detail': 'Password updated.'}, status=status.HTTP_200_OK)


class PasswordResetView(APIView):
    """Called after OTP verification with the temporary reset token."""
    def post(self, request):
        s = PasswordResetSerializer(data=request.data, context={'request': request})
        s.is_valid(raise_exception=True)
        s.save()
        return Response({'detail': 'Password reset successfully.'}, status=status.HTTP_200_OK)

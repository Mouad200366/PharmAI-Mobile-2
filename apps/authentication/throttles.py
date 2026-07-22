from rest_framework.throttling import ScopedRateThrottle


class OTPRequestThrottle(ScopedRateThrottle):
    scope = 'otp_request'


class LoginThrottle(ScopedRateThrottle):
    scope = 'login'

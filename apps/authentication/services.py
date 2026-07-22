import json
import logging
import urllib.request
import urllib.error
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from apps.core.utils.otp import generate_code

from .models import OTPCode

logger = logging.getLogger(__name__)

_OTP_MESSAGES = {
    'signup': '🔐 PharmaAI — Votre code de vérification est *{code}*. Valable 10 minutes. Ne le partagez jamais.',
    'password_reset': '🔑 PharmaAI — Votre code de réinitialisation est *{code}*. Valable 10 minutes.',
    'login': '🔐 PharmaAI — Votre code de connexion est *{code}*. Valable 10 minutes.',
}


def request_otp(phone, purpose='signup'):
    OTPCode.objects.filter(
        phone=phone, purpose=purpose, is_used=False,
    ).update(is_used=True)
    expiry = getattr(settings, 'OTP_EXPIRY_MINUTES', 10)
    length = getattr(settings, 'OTP_LENGTH', 6)
    otp = OTPCode.objects.create(
        phone=phone,
        code=generate_code(length),
        purpose=purpose,
        expires_at=timezone.now() + timedelta(minutes=expiry),
    )
    deliver_otp(phone, otp.code, purpose)
    return otp


def verify_otp(phone, code, purpose='signup'):
    otp = (
        OTPCode.objects
        .filter(phone=phone, purpose=purpose, is_used=False)
        .order_by('-created_at')
        .first()
    )
    if otp is None:
        return False, 'No OTP requested.'
    if otp.expires_at <= timezone.now():
        return False, 'OTP expired.'
    max_attempts = getattr(settings, 'OTP_MAX_ATTEMPTS', 5)
    if otp.attempts >= max_attempts:
        return False, 'Too many attempts.'
    otp.attempts += 1
    if otp.code != str(code):
        otp.save(update_fields=['attempts'])
        return False, 'Invalid code.'
    otp.is_used = True
    otp.save(update_fields=['attempts', 'is_used'])
    return True, 'Verified.'


def deliver_otp(phone: str, code: str, purpose: str) -> None:
    phone_id = getattr(settings, 'WHATSAPP_PHONE_ID', '')
    token = getattr(settings, 'WHATSAPP_TOKEN', '')

    if phone_id and token:
        _send_whatsapp(phone, code, purpose, phone_id, token)
    else:
        _log_otp(phone, code, purpose)


def _send_whatsapp(phone: str, code: str, purpose: str, phone_id: str, token: str) -> None:
    body = _OTP_MESSAGES.get(purpose, 'PharmaAI — Votre code est *{code}*.').format(code=code)
    url = f'https://graph.facebook.com/v19.0/{phone_id}/messages'
    payload = {
        'messaging_product': 'whatsapp',
        'to': phone,
        'type': 'text',
        'text': {'body': body},
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            logger.info('WhatsApp OTP sent to %s (purpose=%s)', phone, purpose)
            return
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode()
        logger.error('WhatsApp API HTTP error %s for %s: %s', exc.code, phone, error_body)
    except Exception as exc:
        logger.error('WhatsApp API error for %s: %s', phone, exc)

    # Fallback to console so the dev flow is never blocked by API errors.
    _log_otp(phone, code, purpose)


def _log_otp(phone: str, code: str, purpose: str) -> None:
    logger.info('[OTP] phone=%s purpose=%s code=%s', phone, purpose, code)
    print(f'\n{"="*50}\n[OTP] phone={phone}  purpose={purpose}  code={code}\n{"="*50}\n')

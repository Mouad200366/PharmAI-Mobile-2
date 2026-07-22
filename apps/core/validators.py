import re

from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _

CIN_REGEX = re.compile(r'^[A-Z]{1,2}[0-9]{5,6}$')


def validate_cin(value):
    if not value:
        raise ValidationError(_('CIN is required.'))
    if not CIN_REGEX.match(value.upper()):
        raise ValidationError(
            _('Invalid CIN. Expected 1-2 letters then 5-6 digits (e.g. AB123456).')
        )

from django.db import models
from django.utils.translation import gettext_lazy as _


class Gender(models.TextChoices):
    MALE = 'M', _('Male')
    FEMALE = 'F', _('Female')
    OTHER = 'O', _('Other')


class UserRole(models.TextChoices):
    PATIENT = 'patient', _('Patient')
    PHARMACIST = 'pharmacist', _('Pharmacist')
    ADMIN = 'admin', _('Admin')
    DELIVERY = 'delivery', _('Delivery person')


class OTPPurpose(models.TextChoices):
    SIGNUP = 'signup', _('Signup')
    LOGIN = 'login', _('Login')
    PASSWORD_RESET = 'password_reset', _('Password reset')

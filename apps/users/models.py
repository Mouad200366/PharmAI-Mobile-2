from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from phonenumber_field.modelfields import PhoneNumberField

from apps.core.constants import Gender, UserRole
from apps.core.validators import validate_cin

from .managers import UserManager


class User(AbstractBaseUser, PermissionsMixin):
    phone = PhoneNumberField(_('phone number'), unique=True, region='MA')
    email = models.EmailField(_('email'), blank=True)
    cin = models.CharField(
        _('CIN'),
        max_length=10,
        unique=True,
        validators=[validate_cin],
    )
    first_name = models.CharField(_('first name'), max_length=80)
    last_name = models.CharField(_('last name'), max_length=80)
    date_of_birth = models.DateField(_('date of birth'))
    gender = models.CharField(_('gender'), max_length=1, choices=Gender.choices)
    role = models.CharField(
        _('role'),
        max_length=20,
        choices=UserRole.choices,
        default=UserRole.PATIENT,
    )
    avatar = models.ImageField(
        _('profile photo'),
        upload_to='avatars/%Y/%m/',
        blank=True,
        null=True,
        max_length=255,
    )

    is_phone_verified = models.BooleanField(_('phone verified'), default=False)
    is_active = models.BooleanField(_('active'), default=True)
    is_staff = models.BooleanField(_('staff'), default=False)
    date_joined = models.DateTimeField(_('date joined'), default=timezone.now)

    objects = UserManager()

    USERNAME_FIELD = 'phone'
    REQUIRED_FIELDS = ['cin', 'first_name', 'last_name', 'date_of_birth', 'gender']

    class Meta:
        verbose_name = _('user')
        verbose_name_plural = _('users')
        ordering = ('-date_joined',)

    def save(self, *args, **kwargs):
        if self.cin:
            self.cin = self.cin.upper()
        super().save(*args, **kwargs)

    @property
    def full_name(self):
        return f'{self.first_name} {self.last_name}'.strip()

    @property
    def is_patient(self):
        return self.role == UserRole.PATIENT

    @property
    def is_pharmacist(self):
        return self.role == UserRole.PHARMACIST

    @property
    def is_delivery(self):
        return self.role == UserRole.DELIVERY

    def __str__(self):
        return f'{self.full_name} ({self.phone})'
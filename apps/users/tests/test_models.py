import pytest
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError

User = get_user_model()
pytestmark = pytest.mark.django_db


def test_create_user_uses_phone_as_login():
    user = User.objects.create_user(
        phone='+212600112233',
        password='Pass1234!',
        cin='AB123456',
        first_name='Test',
        last_name='User',
        date_of_birth='1990-01-01',
        gender='M',
    )
    assert user.check_password('Pass1234!')
    assert User.objects.get(pk=user.pk) == user
    assert user.is_patient is True


def test_invalid_cin_rejected():
    user = User(
        phone='+212600112299',
        cin='12345',
        first_name='X',
        last_name='Y',
        date_of_birth='1990-01-01',
        gender='M',
    )
    user.set_password('Pass1234!')
    with pytest.raises(ValidationError):
        user.full_clean()


def test_cin_normalized_to_uppercase():
    user = User.objects.create_user(
        phone='+212600112255',
        password='Pass1234!',
        cin='ab123456',
        first_name='X',
        last_name='Y',
        date_of_birth='1990-01-01',
        gender='M',
    )
    assert user.cin == 'AB123456'

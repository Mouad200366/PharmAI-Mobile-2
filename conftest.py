"""Shared pytest fixtures for the PharmAI backend test suite.

Placed at the project root so pytest automatically discovers these fixtures
for tests under every Django app.
"""

from datetime import date, time
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point
from rest_framework.test import APIClient

from apps.catalog.models import Medicine
from apps.core.constants import UserRole
from apps.pharmacies.models import Pharmacy, PharmacyStock


User = get_user_model()


@pytest.fixture
def api_client():
    """Unauthenticated DRF test client."""
    return APIClient()


@pytest.fixture
def patient_payload():
    """Valid signup payload used by authentication endpoint tests."""
    return {
        "phone": "+212600100001",
        "email": "patient@example.com",
        "cin": "AB123456",
        "first_name": "Test",
        "last_name": "Patient",
        "date_of_birth": "1995-01-01",
        "gender": "M",
        "password": "StrongPass123!",
        "password_confirm": "StrongPass123!",
    }


@pytest.fixture
def patient(db):
    """Verified patient account used by authenticated/service tests."""
    return User.objects.create_user(
        phone="+212600100002",
        password="StrongPass123!",
        email="verified.patient@example.com",
        cin="CD123456",
        first_name="Verified",
        last_name="Patient",
        date_of_birth=date(1995, 1, 1),
        gender="M",
        role=UserRole.PATIENT,
        is_phone_verified=True,
    )


@pytest.fixture
def auth_client(patient):
    """DRF client authenticated as the standard patient fixture."""
    client = APIClient()
    client.force_authenticate(user=patient)
    return client


@pytest.fixture
def pharmacist(db):
    """Verified pharmacist account that owns the test pharmacy."""
    return User.objects.create_user(
        phone="+212600100003",
        password="StrongPass123!",
        email="pharmacist@example.com",
        cin="EF123456",
        first_name="Test",
        last_name="Pharmacist",
        date_of_birth=date(1985, 1, 1),
        gender="F",
        role=UserRole.PHARMACIST,
        is_phone_verified=True,
    )


@pytest.fixture
def pharmacy(pharmacist):
    """Active, verified pharmacy at the coordinates used by order tests.

    It is open all day so order tests do not depend on the wall-clock time
    when pytest happens to run.
    """
    return Pharmacy.objects.create(
        owner=pharmacist,
        name="Pharmacie Test",
        license_number="TEST-LIC-001",
        phone="+212522100001",
        address="Place Mohammed V, Casablanca",
        location=Point(
            -7.5898,
            33.5731,
            srid=4326,
        ),
        opens_at=time(0, 0),
        closes_at=time(23, 59, 59),
        is_active=True,
        is_verified=True,
    )


@pytest.fixture
def medicine(db):
    """Regular non-prescription medicine."""
    return Medicine.objects.create(
        name="Paracetamol Test",
        generic_name="Paracetamol",
        description="Test medicine",
        manufacturer="PharmAI Test",
        requires_prescription=False,
        is_active=True,
    )


@pytest.fixture
def rx_medicine(db):
    """Medicine that requires a prescription."""
    return Medicine.objects.create(
        name="Amoxicillin Test",
        generic_name="Amoxicillin",
        description="Prescription-only test medicine",
        manufacturer="PharmAI Test",
        requires_prescription=True,
        is_active=True,
    )


@pytest.fixture
def stock(pharmacy, medicine):
    """Available stock used throughout order and payment tests."""
    return PharmacyStock.objects.create(
        pharmacy=pharmacy,
        medicine=medicine,
        price=Decimal("12.50"),
        quantity=20,
        is_available=True,
    )
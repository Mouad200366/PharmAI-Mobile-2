"""Seeds the catalog with the same 10 medicines Pharmagent's RAG already
knows about (its leaflet PDFs cover exactly these), so the Dashboard
catalog and the AI Assistant stay consistent with each other. Also seeds
two pharmacies (with pharmacist-owner accounts) and stock/pricing so the
catalog has real, orderable data instead of an empty database.

Safe to re-run — everything is get_or_create'd, no duplicates on repeat
runs.

No product images are seeded here on purpose: there are no real photos
anywhere in this project to source from, and hotlinking arbitrary
third-party stock photos into a seed script isn't something to do without
you personally checking each image's license. The catalog UI has a clean
icon fallback for medicines with no photo — add real ones anytime via
/admin/ (Catalog > Medicines > click a medicine > upload an image).

Usage:
    python manage.py seed_catalog
"""
from datetime import date, time

from django.contrib.gis.geos import Point
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.catalog.models import Medicine
from apps.core.constants import Gender, UserRole
from apps.pharmacies.models import Pharmacy, PharmacyStock
from apps.users.models import User

# Same 10 drugs Pharmagent has leaflets for (pharmagent/data/leaflets/).
MEDICINES = [
    dict(
        name='Acetaminophen', generic_name='Paracétamol',
        manufacturer='Cooper Pharma',
        description="Antalgique et antipyrétique utilisé pour soulager la douleur légère à modérée et faire baisser la fièvre.",
        requires_prescription=False,
    ),
    dict(
        name='Amoxicillin', generic_name='Amoxicilline',
        manufacturer='Sothema',
        description="Antibiotique de la famille des pénicillines, utilisé pour traiter diverses infections bactériennes.",
        requires_prescription=True,
    ),
    dict(
        name='Aspirin', generic_name='Acide acétylsalicylique',
        manufacturer='Bayer Maroc',
        description="Antalgique, antipyrétique et anti-inflammatoire, aussi utilisé à faible dose en prévention cardiovasculaire.",
        requires_prescription=False,
    ),
    dict(
        name='Atorvastatin', generic_name='Atorvastatine',
        manufacturer='Pfizer Maroc',
        description="Statine utilisée pour réduire le cholestérol et prévenir les maladies cardiovasculaires.",
        requires_prescription=True,
    ),
    dict(
        name='Ibuprofen', generic_name='Ibuprofène',
        manufacturer='Sanofi Maroc',
        description="Anti-inflammatoire non stéroïdien (AINS) utilisé pour soulager la douleur, la fièvre et l'inflammation.",
        requires_prescription=False,
    ),
    dict(
        name='Lisinopril', generic_name='Lisinopril',
        manufacturer='Cooper Pharma',
        description="Inhibiteur de l'enzyme de conversion (IEC) utilisé dans le traitement de l'hypertension artérielle.",
        requires_prescription=True,
    ),
    dict(
        name='Loratadine', generic_name='Loratadine',
        manufacturer='Sothema',
        description="Antihistaminique de seconde génération utilisé pour soulager les symptômes allergiques.",
        requires_prescription=False,
    ),
    dict(
        name='Metformin', generic_name='Metformine',
        manufacturer='Sanofi Maroc',
        description="Antidiabétique oral utilisé en première intention dans le traitement du diabète de type 2.",
        requires_prescription=True,
    ),
    dict(
        name='Omeprazole', generic_name='Oméprazole',
        manufacturer='Bayer Maroc',
        description="Inhibiteur de la pompe à protons utilisé pour traiter les reflux gastro-œsophagiens et ulcères.",
        requires_prescription=False,
    ),
    dict(
        name='Salbutamol', generic_name='Salbutamol',
        manufacturer='Cooper Pharma',
        description="Bronchodilatateur à courte durée d'action utilisé dans le traitement de l'asthme et des bronchospasmes.",
        requires_prescription=True,
    ),
]

# Two pharmacies around Casablanca so stock/price actually varies between
# them, which is what makes proximity-based ordering meaningful later.
PHARMACIES = [
    dict(
        phone='+212600000001', cin='PH000001',
        first_name='Yassine', last_name='Idrissi',
        name='Pharmacie Al Manar', license_number='LIC-CASA-0001',
        address='12 Boulevard Mohammed V, Casablanca',
        lat=33.5850, lng=-7.6114,  # central Casablanca
        opens_at=time(8, 0), closes_at=time(22, 0),
    ),
    dict(
        phone='+212600000002', cin='PH000002',
        first_name='Salma', last_name='Bennis',
        name='Pharmacie Océan', license_number='LIC-CASA-0002',
        address='45 Rue Ibnou Sina, Maarif, Casablanca',
        lat=33.5731, lng=-7.6298,  # Maarif district
        opens_at=time(8, 30), closes_at=time(21, 30),
    ),
]


class Command(BaseCommand):
    help = 'Seeds 10 medicines + 2 pharmacies + stock/pricing for the catalog.'

    @transaction.atomic
    def handle(self, *args, **options):
        medicines = self._seed_medicines()
        pharmacies = self._seed_pharmacies()
        self._seed_stock(medicines, pharmacies)

        self.stdout.write(self.style.SUCCESS(
            f'Seeded {len(medicines)} medicines, {len(pharmacies)} pharmacies, '
            f'{len(medicines) * len(pharmacies)} stock entries.'
        ))
        self.stdout.write(
            'No images seeded — run `python manage.py fetch_dailymed_images` '
            'to pull real product photos from DailyMed (NLM/FDA), or add '
            'them manually via /admin/ (Catalog > Medicines).'
        )

    def _seed_medicines(self):
        medicines = []
        for data in MEDICINES:
            medicine, created = Medicine.objects.get_or_create(
                name=data['name'], defaults=data,
            )
            medicines.append(medicine)
            self.stdout.write(f'  {"created" if created else "exists "}  Medicine: {medicine.name}')
        return medicines

    def _seed_pharmacies(self):
        pharmacies = []
        for data in PHARMACIES:
            owner, created = User.objects.get_or_create(
                phone=data['phone'],
                defaults=dict(
                    cin=data['cin'],
                    first_name=data['first_name'],
                    last_name=data['last_name'],
                    date_of_birth=date(1985, 1, 1),
                    gender=Gender.MALE,
                    role=UserRole.PHARMACIST,
                    is_phone_verified=True,
                ),
            )
            if created:
                owner.set_password('changeme123')
                owner.save(update_fields=['password'])

            pharmacy, created = Pharmacy.objects.get_or_create(
                license_number=data['license_number'],
                defaults=dict(
                    owner=owner,
                    name=data['name'],
                    phone=data['phone'],
                    address=data['address'],
                    location=Point(data['lng'], data['lat'], srid=4326),
                    opens_at=data['opens_at'],
                    closes_at=data['closes_at'],
                    is_active=True,
                    is_verified=True,
                ),
            )
            pharmacies.append(pharmacy)
            self.stdout.write(f'  {"created" if created else "exists "}  Pharmacy: {pharmacy.name}')
        return pharmacies

    def _seed_stock(self, medicines, pharmacies):
        # Simple deterministic pricing so it's the same every run: base
        # price by medicine index, +/- a per-pharmacy variation so prices
        # aren't identical across pharmacies (more realistic, and gives
        # "cheapest nearby" something real to compare).
        base_prices = [15, 45, 12, 85, 18, 65, 28, 55, 38, 72]
        for pi, pharmacy in enumerate(pharmacies):
            for mi, medicine in enumerate(medicines):
                price = base_prices[mi] + (pi * 3) - 1.5
                PharmacyStock.objects.get_or_create(
                    pharmacy=pharmacy, medicine=medicine,
                    defaults=dict(
                        price=round(price, 2),
                        quantity=50,
                        is_available=True,
                    ),
                )

"""Seed the PharmAI test catalog.

Creates or updates:
- 20 medicines
- Medicine image paths
- 2 test pharmacies with pharmacist accounts
- Stock, prices, quantities and availability

The first 10 medicines match the current PharmAgent leaflet documents.
The additional 10 medicines are test catalogue entries and must still be
added to PharmAgent's knowledge base.

Safe to run repeatedly without creating duplicate medicines, pharmacies
or stock records.

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
    dict(
        name='Cetirizine',
        generic_name='Cétirizine',
        manufacturer='PharmAI Demo',
        description="Antihistaminique utilisé pour soulager les symptômes des allergies, notamment les éternuements, les démangeaisons et l'écoulement nasal.",
        requires_prescription=False,
    ),
    dict(
        name='Azithromycin',
        generic_name='Azithromycine',
        manufacturer='PharmAI Demo',
        description="Antibiotique de la famille des macrolides utilisé pour traiter certaines infections bactériennes.",
        requires_prescription=True,
    ),
    dict(
        name='Diclofenac',
        generic_name='Diclofénac',
        manufacturer='PharmAI Demo',
        description="Anti-inflammatoire non stéroïdien utilisé pour réduire certaines douleurs et inflammations.",
        requires_prescription=True,
    ),
    dict(
        name='Amlodipine',
        generic_name='Amlodipine',
        manufacturer='PharmAI Demo',
        description="Inhibiteur calcique utilisé dans le traitement de l'hypertension artérielle et de certaines formes d'angine de poitrine.",
        requires_prescription=True,
    ),
    dict(
        name='Losartan',
        generic_name='Losartan',
        manufacturer='PharmAI Demo',
        description="Antagoniste des récepteurs de l'angiotensine II utilisé principalement dans le traitement de l'hypertension artérielle.",
        requires_prescription=True,
    ),
    dict(
        name='Pantoprazole',
        generic_name='Pantoprazole',
        manufacturer='PharmAI Demo',
        description="Inhibiteur de la pompe à protons utilisé pour réduire la production d'acide gastrique.",
        requires_prescription=True,
    ),
    dict(
        name='Clotrimazole',
        generic_name='Clotrimazole',
        manufacturer='PharmAI Demo',
        description="Antifongique utilisé principalement pour traiter certaines infections fongiques de la peau.",
        requires_prescription=False,
    ),
    dict(
        name='Dextromethorphan',
        generic_name='Dextrométhorphane',
        manufacturer='PharmAI Demo',
        description="Antitussif utilisé pour soulager temporairement certaines toux sèches non productives.",
        requires_prescription=False,
    ),
    dict(
        name='Fluconazole',
        generic_name='Fluconazole',
        manufacturer='PharmAI Demo',
        description="Antifongique systémique utilisé dans le traitement de certaines infections provoquées par des champignons.",
        requires_prescription=True,
    ),
    dict(
        name='Hydrocortisone',
        generic_name='Hydrocortisone',
        manufacturer='PharmAI Demo',
        description="Corticostéroïde utilisé sous certaines formes topiques pour réduire les inflammations et démangeaisons cutanées.",
        requires_prescription=False,
    ),
]
MEDICINE_IMAGES = {
    'Acetaminophen': 'medicines/acetaminophen.jpg',
    'Amoxicillin': 'medicines/amoxicillin.jpg',
    'Aspirin': 'medicines/aspirin.jpg',
    'Atorvastatin': 'medicines/atorvastatin.jpg',
    'Ibuprofen': 'medicines/ibuprofen.jpg',
    'Lisinopril': 'medicines/lisinopril.jpg',
    'Loratadine': 'medicines/loratadine.jpg',
    'Metformin': 'medicines/metformin.jpg',
    'Omeprazole': 'medicines/omeprazole.jpg',
    'Salbutamol': 'medicines/salbutamol.jpg',

    'Cetirizine': 'medicines/cetirizine.jpg',
    'Azithromycin': 'medicines/azithromycin.jpg',
    'Diclofenac': 'medicines/diclofenac.jpg',
    'Amlodipine': 'medicines/amlodipine.jpg',
    'Losartan': 'medicines/losartan.jpg',
    'Pantoprazole': 'medicines/pantoprazole.jpg',
    'Clotrimazole': 'medicines/clotrimazole.jpg',
    'Dextromethorphan': 'medicines/dextromethorphan.jpg',
    'Fluconazole': 'medicines/fluconazole.jpg',
    'Hydrocortisone': 'medicines/hydrocortisone.jpg',
}

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
    help = 'Seeds 20 medicines + 2 pharmacies + stock/pricing for the catalog.'

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
            'Medicine image paths were connected from MEDICINE_IMAGES.'
        )

    def _seed_medicines(self):
        medicines = []

        for data in MEDICINES:
            medicine_data = data.copy()

            medicine_data['image'] = MEDICINE_IMAGES.get(
                data['name'],
            )

            medicine, created = Medicine.objects.update_or_create(
                name=data['name'],
                defaults=medicine_data,
            )

            medicines.append(medicine)

            status = 'created' if created else 'updated'

            self.stdout.write(
                f'  {status:<7} Medicine: {medicine.name}'
            )

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
        base_prices = [15, 45, 12, 85, 18,65, 28, 55, 38, 72,22, 55, 30, 48, 60,42, 25, 32, 70, 20,]
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

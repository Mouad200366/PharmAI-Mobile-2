"""Fetches a real product image for each seeded medicine from DailyMed
(NLM/FDA's public structured drug labeling database), for medicines that
don't have one yet.

DailyMed is a good fit for this: it's a free, public, no-API-key US
government service, and FDA-submitted drug labeling isn't the kind of
content you need to license — unlike arbitrary stock photography, there's
no per-image copyright judgment call needed here.

One real limitation, found by actually checking the docs before writing
this: DailyMed's old blanket pill-image API (RxImage) was shut down in
2021. Only images a labeler chose to submit alongside their own label
remain, via the /media endpoint — coverage is inconsistent, not
guaranteed per drug. This command checks several manufacturer submissions
per medicine (most generics have many) and takes the first one with a
real image; medicines where none of those checked have an image are left
with the icon fallback already built into the catalog UI.

All DailyMed content is in English (it's a US FDA database) -- this only
pulls images, not description text, so the existing French descriptions
in seed_catalog.py are untouched.

Usage:
    python manage.py fetch_dailymed_images
    python manage.py fetch_dailymed_images --overwrite
    python manage.py fetch_dailymed_images --overwrite --only "Atorvastatin,Metformin"
"""
import json
import time
import urllib.error
import urllib.parse
import urllib.request

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand

from apps.catalog.models import Medicine

BASE_URL = 'https://dailymed.nlm.nih.gov/dailymed/services/v2'
IMAGE_EXTENSIONS = ('.jpg', '.jpeg', '.png')
REQUEST_TIMEOUT = 15
USER_AGENT = 'PharmAI-catalog-seed/1.0 (educational project)'

# Filenames containing these are almost never product/package photos --
# they're clinical trial charts, chemical structure diagrams, dosing
# graphs, etc. that labelers sometimes bundle into the same SPL media set
# as the actual package image. Found by inspecting real results (e.g.
# atorvastatin's first hit was literally "Figure-01.jpg", a Kaplan-Meier
# curve, not a photo of the bottle).
SKIP_FILENAME_PATTERNS = ('fig', 'chart', 'graph', 'structure', 'diagram')

# DailyMed indexes drugs by their US-adopted name; one of ours differs
# from the generic/INN name we store (salbutamol is the INN, "albuterol"
# is what US labeling and DailyMed use for the same substance).
DAILYMED_NAME_OVERRIDES = {
    'Salbutamol': 'albuterol',
}


def _get_json(url: str) -> dict | None:
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError):
        return None


def _get_bytes(url: str) -> bytes | None:
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
            return resp.read()
    except (urllib.error.URLError, urllib.error.HTTPError):
        return None


def find_image_for_drug(drug_name: str, max_spls: int) -> tuple[str, bytes] | None:
    """Checks up to `max_spls` DailyMed labels for `drug_name` and returns
    the first (filename, image_bytes) pair found, or None."""
    query = urllib.parse.urlencode({'drug_name': drug_name, 'pagesize': max_spls})
    spls_data = _get_json(f'{BASE_URL}/spls.json?{query}')
    if not spls_data:
        return None

    spls = spls_data.get('data', [])
    # Prefer labels for the plain generic drug over combination-brand
    # products that happen to contain it as one ingredient (e.g.
    # "Janumet" contains metformin, but its label/media isn't a photo of
    # a metformin package -- it's a different combo product entirely).
    # Python's sort is stable, so ties keep DailyMed's original order.
    drug_upper = drug_name.upper()
    spls.sort(key=lambda s: 0 if (s.get('title') or '').upper().startswith(drug_upper) else 1)

    for spl in spls:
        setid = spl.get('setid')
        if not setid:
            continue

        media_data = _get_json(f'{BASE_URL}/spls/{setid}/media.json')
        if not media_data:
            continue
        media_files = media_data.get('data', {}).get('media', [])

        for file in media_files:
            url = file.get('url', '')
            name = (file.get('name') or '').lower()
            if not url.lower().endswith(IMAGE_EXTENSIONS):
                continue
            if any(pattern in name for pattern in SKIP_FILENAME_PATTERNS):
                continue
            image_bytes = _get_bytes(url)
            if image_bytes:
                filename = file.get('name') or f'{setid}.jpg'
                return filename, image_bytes

        time.sleep(0.2)  # be polite to a free public government API

    return None


class Command(BaseCommand):
    help = (
        "Fetches product images from DailyMed for medicines that don't "
        "have one yet. Run `seed_catalog` first."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--overwrite', action='store_true',
            help='Replace existing images too, not just fill in missing ones.',
        )
        parser.add_argument(
            '--max-spls', type=int, default=8,
            help='How many DailyMed labels to check per medicine before giving up.',
        )
        parser.add_argument(
            '--only', type=str, default='',
            help='Comma-separated medicine names to process (e.g. "Atorvastatin,Metformin"). '
                 'Default: all medicines.',
        )

    def handle(self, *args, **options):
        overwrite = options['overwrite']
        max_spls = options['max_spls']
        only = {n.strip() for n in options['only'].split(',') if n.strip()}

        medicines = Medicine.objects.all()
        if only:
            medicines = medicines.filter(name__in=only)
        found, skipped, missing = 0, 0, 0

        for medicine in medicines:
            if medicine.image and not overwrite:
                self.stdout.write(f'  skip      {medicine.name} (already has an image)')
                skipped += 1
                continue

            search_name = DAILYMED_NAME_OVERRIDES.get(medicine.name, medicine.name)
            result = find_image_for_drug(search_name, max_spls)

            if result is None:
                self.stdout.write(self.style.WARNING(
                    f'  no image  {medicine.name} — none found on DailyMed, keeping icon fallback'
                ))
                missing += 1
                continue

            filename, content = result
            medicine.image.save(filename, ContentFile(content), save=True)
            self.stdout.write(self.style.SUCCESS(f'  saved     {medicine.name} <- {filename}'))
            found += 1

        self.stdout.write(
            self.style.SUCCESS(f'\nDone: {found} images saved, {skipped} skipped, {missing} not found.')
        )
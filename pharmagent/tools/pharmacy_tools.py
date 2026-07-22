import json
import math
from datetime import datetime
from pathlib import Path

PHARMACIES_PATH = Path("data/pharmacies.json")
STOCK_PATH = Path("data/stock.json")
NIGHT_SHIFT_PATH = Path("data/night_shift_schedule.json")


def load_json(path: Path) -> dict | list:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate distance in kilometers between two coordinates."""
    R = 6371
    lat1, lng1, lat2, lng2 = map(math.radians, [lat1, lng1, lat2, lng2])
    dlat = lat2 - lat1
    dlng = lng2 - lng1
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng/2)**2
    return R * 2 * math.asin(math.sqrt(a))


def is_pharmacy_open(pharmacy: dict) -> bool:
    """Check if a pharmacy is currently open based on its opening hours."""
    hours = pharmacy.get("opening_hours", "")
    if hours == "24h/24":
        return True
    try:
        now = datetime.now()
        current_minutes = now.hour * 60 + now.minute
        open_str, close_str = hours.split("-")
        open_h, open_m = map(int, open_str.split(":"))
        close_h, close_m = map(int, close_str.split(":"))
        open_minutes = open_h * 60 + open_m
        close_minutes = close_h * 60 + close_m
        return open_minutes <= current_minutes <= close_minutes
    except Exception:
        return False


def get_night_shift_pharmacies(date_str: str = None) -> list[str]:
    """
    Get pharmacy IDs on night shift for a given date.
    If no date given, uses today.
    """
    schedule = load_json(NIGHT_SHIFT_PATH)
    if not date_str:
        date_str = datetime.now().strftime("%Y-%m-%d")
    return schedule.get(date_str, [])


def find_pharmacies_with_stock(
    medicine_name: str,
    user_lat: float,
    user_lng: float,
    max_results: int = 5
) -> list[dict]:
    """
    Find pharmacies that have a medicine in stock, are open,
    sorted by distance from user location.
    """
    pharmacies = load_json(PHARMACIES_PATH)
    stock = load_json(STOCK_PATH)
    night_shift_ids = get_night_shift_pharmacies()

    medicine_lower = medicine_name.lower().strip()

    results = []
    for pharmacy in pharmacies:
        ph_id = pharmacy["id"]
        ph_stock = stock.get(ph_id, [])

        # Check if medicine is in stock
        medicine_match = None
        for item in ph_stock:
            if medicine_lower in item["medicine"].lower() or item["medicine"].lower() in medicine_lower:
                medicine_match = item
                break

        if not medicine_match:
            continue

        # Check if pharmacy is open (regular hours or night shift)
        is_open = is_pharmacy_open(pharmacy) or (ph_id in night_shift_ids)
        if not is_open:
            continue

        # Calculate distance
        distance = haversine_distance(
            user_lat, user_lng,
            pharmacy["lat"], pharmacy["lng"]
        )

        results.append({
            "id": ph_id,
            "name": pharmacy["name"],
            "address": pharmacy["address"],
            "phone": pharmacy["phone"],
            "distance_km": round(distance, 2),
            "price": medicine_match["price"],
            "quantity": medicine_match["quantity"],
            "requires_prescription": medicine_match["requires_prescription"],
            "is_night_shift": ph_id in night_shift_ids,
            "opening_hours": pharmacy["opening_hours"]
        })

    # Sort by distance
    results.sort(key=lambda x: x["distance_km"])
    return results[:max_results]


def get_all_open_pharmacies(user_lat: float, user_lng: float) -> list[dict]:
    """Get all currently open pharmacies sorted by distance."""
    pharmacies = load_json(PHARMACIES_PATH)
    night_shift_ids = get_night_shift_pharmacies()

    results = []
    for pharmacy in pharmacies:
        is_open = is_pharmacy_open(pharmacy) or (pharmacy["id"] in night_shift_ids)
        if not is_open:
            continue

        distance = haversine_distance(
            user_lat, user_lng,
            pharmacy["lat"], pharmacy["lng"]
        )
        results.append({
            "id": pharmacy["id"],
            "name": pharmacy["name"],
            "address": pharmacy["address"],
            "phone": pharmacy["phone"],
            "distance_km": round(distance, 2),
            "is_night_shift": pharmacy["id"] in night_shift_ids,
            "opening_hours": pharmacy["opening_hours"]
        })

    results.sort(key=lambda x: x["distance_km"])
    return results
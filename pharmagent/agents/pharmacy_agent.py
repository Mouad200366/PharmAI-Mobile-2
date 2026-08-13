import os
import unicodedata

import requests
from dotenv import load_dotenv

load_dotenv()

# PharmAgent and Django run on the same development machine, so localhost is
# the safest default for server-to-server communication. Override this in
# pharmagent/.env when deploying the services separately.
PHARMAI_API_URL = os.getenv(
    "PHARMAI_API_URL",
    "http://127.0.0.1:8000/api/v1",
).rstrip("/")

PHARMAI_SEARCH_RADIUS_M = int(
    os.getenv(
        "PHARMAI_SEARCH_RADIUS_M",
        "5000",
    )
)

PHARMAI_API_TIMEOUT_SECONDS = float(
    os.getenv(
        "PHARMAI_API_TIMEOUT_SECONDS",
        "6",
    )
)


def _normalize(value: str) -> str:
    """Normalize medicine names for a conservative best-result match."""
    normalized = unicodedata.normalize(
        "NFD",
        value or "",
    )

    without_accents = "".join(
        char
        for char in normalized
        if unicodedata.category(char) != "Mn"
    )

    return " ".join(
        without_accents
        .lower()
        .strip()
        .split()
    )


def _choose_best_result(
    medicine: str,
    results: list[dict],
) -> dict | None:
    """
    Django search is fuzzy and may return more than one medicine.

    Prefer an exact normalized match against either the medicine name or
    generic name. Then prefer a containment match. Only then fall back to the
    first ranked Django result.
    """
    if not results:
        return None

    wanted = _normalize(medicine)

    exact = next(
        (
            result
            for result in results
            if _normalize(
                str(
                    result.get(
                        "medicine_name",
                        "",
                    )
                )
            )
            == wanted
            or _normalize(
                str(
                    result.get(
                        "generic_name",
                        "",
                    )
                )
            )
            == wanted
        ),
        None,
    )

    if exact:
        return exact

    partial = next(
        (
            result
            for result in results
            if (
                wanted
                and (
                    wanted
                    in _normalize(
                        str(
                            result.get(
                                "medicine_name",
                                "",
                            )
                        )
                    )
                    or wanted
                    in _normalize(
                        str(
                            result.get(
                                "generic_name",
                                "",
                            )
                        )
                    )
                    or _normalize(
                        str(
                            result.get(
                                "medicine_name",
                                "",
                            )
                        )
                    )
                    in wanted
                    or _normalize(
                        str(
                            result.get(
                                "generic_name",
                                "",
                            )
                        )
                    )
                    in wanted
                )
            )
        ),
        None,
    )

    return partial or results[0]


def _search_django(
    medicine: str,
    user_lat: float,
    user_lng: float,
) -> dict | None:
    """
    Query PharmAI's real medicine-nearby search.

    The Django search service is the source of truth for:
    - real catalog medicine IDs/names
    - real PharmacyStock price and quantity availability
    - verified/active pharmacies
    - distance from the patient's saved coordinates
    - current opening / night-shift availability
    """
    try:
        response = requests.get(
            f"{PHARMAI_API_URL}/search/",
            params={
                "q": medicine,
                "lat": user_lat,
                "lng": user_lng,
                "radius": PHARMAI_SEARCH_RADIUS_M,
                "limit": 20,
                "open_now": "true",
            },
            timeout=PHARMAI_API_TIMEOUT_SECONDS,
        )

        response.raise_for_status()
        payload = response.json()

    except requests.RequestException as exc:
        raise RuntimeError(
            "Impossible de contacter l’API Django PharmAI pour vérifier "
            "la disponibilité réelle des médicaments."
        ) from exc
    except ValueError as exc:
        raise RuntimeError(
            "L’API Django PharmAI a renvoyé une réponse invalide."
        ) from exc

    results = payload.get("results", [])

    if not isinstance(results, list):
        raise RuntimeError(
            "Format inattendu reçu depuis la recherche PharmAI."
        )

    return _choose_best_result(
        medicine,
        results,
    )


def _availability_option(
    result: dict,
) -> dict:
    """
    Convert Django's medicine-centric search result into a stable PharmAgent
    response shape.

    No pharmacy identity is invented here. Django intentionally owns pharmacy
    routing; PharmAgent reports truthful nearby availability only.
    """
    distance_m = result.get(
        "nearest_distance_m"
    )

    distance_km = None

    if isinstance(
        distance_m,
        (int, float),
    ):
        distance_km = round(
            float(distance_m) / 1000,
            2,
        )

    raw_price = result.get(
        "min_price"
    )

    try:
        price = (
            float(raw_price)
            if raw_price is not None
            else None
        )
    except (
        TypeError,
        ValueError,
    ):
        price = None

    available_count = int(
        result.get(
            "available_count",
            0,
        )
        or 0
    )

    return {
        "id": result.get(
            "medicine_id"
        ),
        "name": (
            f"{available_count} pharmacie"
            if available_count == 1
            else f"{available_count} pharmacies"
        ),
        "medicine_name": result.get(
            "medicine_name",
            "",
        ),
        "generic_name": result.get(
            "generic_name",
            "",
        ),
        "distance_km": distance_km,
        "price": price,
        "requires_prescription": bool(
            result.get(
                "requires_prescription",
                False,
            )
        ),
        "is_night_shift": bool(
            result.get(
                "available_at_night_shift",
                False,
            )
        ),
        "available_count": available_count,
        "eta_minutes": result.get(
            "eta_minutes"
        ),
        "source": "pharmai_django",
    }


def _format_summary(
    availability_by_medicine: dict[
        str,
        list[dict],
    ],
) -> str:
    lines: list[str] = []

    for medicine, options in (
        availability_by_medicine.items()
    ):
        if not options:
            lines.append(
                f"{medicine} : aucune disponibilité ouverte trouvée "
                f"dans un rayon de "
                f"{PHARMAI_SEARCH_RADIUS_M / 1000:g} km."
            )
            continue

        option = options[0]
        count = option.get(
            "available_count",
            0,
        )

        parts = [
            f"{medicine} : disponible dans {count} "
            + (
                "pharmacie"
                if count == 1
                else "pharmacies"
            )
        ]

        price = option.get("price")
        if price is not None:
            parts.append(
                f"à partir de {price:.2f} MAD"
            )

        distance_km = option.get(
            "distance_km"
        )
        if distance_km is not None:
            parts.append(
                f"à environ {distance_km:.2f} km "
                "pour l’option la plus proche"
            )

        eta = option.get(
            "eta_minutes"
        )
        if eta is not None:
            parts.append(
                f"ETA estimée {eta} min"
            )

        if option.get(
            "is_night_shift"
        ):
            parts.append(
                "disponibilité en pharmacie de garde"
            )

        lines.append(
            ", ".join(parts) + "."
        )

    return " ".join(lines)


def run_pharmacy_agent(
    medicines: list[str],
    user_lat: float,
    user_lng: float,
) -> dict:
    """
    Check real nearby medicine availability through the PharmAI Django API.

    This replaces the original local JSON mock pharmacy/stock files.
    The result remains compatible with the existing LangGraph state and
    streaming API while using Django as the single source of truth.
    """
    print(
        "[Pharmacy Agent] "
        f"Checking real PharmAI availability for: {medicines}"
    )

    all_options: dict[
        str,
        list[dict],
    ] = {}

    requires_prescription: dict[
        str,
        bool,
    ] = {}

    for medicine in medicines:
        medicine_name = (
            str(medicine).strip()
        )

        if not medicine_name:
            continue

        print(
            "[Pharmacy Agent] "
            f"Searching Django stock for: {medicine_name}"
        )

        result = _search_django(
            medicine_name,
            user_lat,
            user_lng,
        )

        if result is None:
            all_options[
                medicine_name
            ] = []

            print(
                "[Pharmacy Agent] "
                f"No real open stock found for {medicine_name}"
            )
            continue

        option = _availability_option(
            result
        )

        all_options[
            medicine_name
        ] = [option]

        requires_prescription[
            medicine_name
        ] = option[
            "requires_prescription"
        ]

        print(
            "[Pharmacy Agent] "
            f"Real availability: "
            f"{option['available_count']} pharmacy/pharmacies, "
            f"nearest={option['distance_km']} km, "
            f"price={option['price']} MAD"
        )

    summary = _format_summary(
        all_options
    )

    # `top_pharmacy` is intentionally None: the patient-facing Django search
    # hides pharmacy identity and the order service owns pharmacy routing.
    return {
        "top_pharmacy": None,
        "all_options": all_options,
        "requires_prescription":
            requires_prescription,
        "summary": summary,
        "source": "pharmai_django",
    }


if __name__ == "__main__":
    print(
        run_pharmacy_agent(
            medicines=["ibuprofen"],
            user_lat=33.5731,
            user_lng=-7.5898,
        )
    )
from pathlib import Path
from typing import Any

import pandas as pd


INTERACTIONS_PATH = Path("data/interactions.csv")
GUIDELINES_PATH = Path("data/pharmacist_guidelines.txt")


# Fallback list used only when the agents do not provide
# prescription information for a medicine.
OTC_MEDICINES = {
    "acetaminophen",
    "paracetamol",
    "ibuprofen",
    "aspirin",
    "loratadine",
    "omeprazole",
    "cetirizine",
    "clotrimazole",
    "dextromethorphan",
    "hydrocortisone",
}


# Maximum safe daily doses in mg.
# These values are kept for future dosage validation.
MAX_DAILY_DOSES = {
    "acetaminophen": 4000,
    "paracetamol": 4000,
    "ibuprofen": 1200,
    "aspirin": 4000,
    "loratadine": 10,
    "omeprazole": 40,
    "cetirizine": 10,
}


# Known dangerous combinations.
DANGEROUS_PAIRS = [
    ("ibuprofen", "aspirin"),
    ("ibuprofen", "lisinopril"),
    ("aspirin", "lisinopril"),
]


def normalize_medicine_name(value: Any) -> str:
    """Return a consistent medicine name for comparisons."""

    return str(value or "").strip().casefold()


def parse_boolean(value: Any) -> bool | None:
    """
    Convert common boolean representations safely.

    Returns None if the supplied value cannot be interpreted.
    """

    if isinstance(value, bool):
        return value

    if isinstance(value, int) and value in (0, 1):
        return bool(value)

    if isinstance(value, str):
        normalized_value = value.strip().casefold()

        if normalized_value in {
            "true",
            "1",
            "yes",
            "y",
        }:
            return True

        if normalized_value in {
            "false",
            "0",
            "no",
            "n",
        }:
            return False

    return None


def normalize_prescription_map(
    requires_prescription: dict[str, Any] | None,
) -> dict[str, bool]:
    """
    Normalize medicine names and prescription values received
    from the medical and pharmacy agents.
    """

    normalized_map: dict[str, bool] = {}

    if not isinstance(requires_prescription, dict):
        return normalized_map

    for medicine, raw_value in requires_prescription.items():
        medicine_key = normalize_medicine_name(medicine)
        parsed_value = parse_boolean(raw_value)

        if medicine_key and parsed_value is not None:
            normalized_map[medicine_key] = parsed_value

    return normalized_map


def check_prescription_requirements(
    medicines: list[str],
) -> dict[str, bool]:
    """
    Return fallback prescription requirements.

    Medicines absent from OTC_MEDICINES are treated
    conservatively as prescription-only.
    """

    result: dict[str, bool] = {}

    for medicine in medicines:
        medicine_key = normalize_medicine_name(medicine)

        result[medicine] = (
            medicine_key not in OTC_MEDICINES
        )

    return result


def check_dangerous_combinations(
    medicines: list[str],
) -> list[str]:
    """
    Check whether the recommendation contains dangerous
    medicine combinations.
    """

    warnings: list[str] = []

    medicines_lower = {
        normalize_medicine_name(medicine)
        for medicine in medicines
        if normalize_medicine_name(medicine)
    }

    for drug_a, drug_b in DANGEROUS_PAIRS:
        if (
            drug_a in medicines_lower
            and drug_b in medicines_lower
        ):
            warnings.append(
                "DANGEROUS COMBINATION: "
                f"{drug_a} and {drug_b} "
                "should not be taken together"
            )

    # Also check the interactions CSV file.
    try:
        dataframe = pd.read_csv(
            INTERACTIONS_PATH
        )

        for _, row in dataframe.iterrows():
            drug_a = normalize_medicine_name(
                row.get("drug_a")
            )

            drug_b = normalize_medicine_name(
                row.get("drug_b")
            )

            severity = normalize_medicine_name(
                row.get("severity")
            )

            if (
                drug_a in medicines_lower
                and drug_b in medicines_lower
                and severity in {
                    "moderate",
                    "major",
                }
            ):
                description = row.get(
                    "description",
                    "No description available",
                )

                warnings.append(
                    f"INTERACTION ({severity}): "
                    f"{drug_a} + {drug_b}: "
                    f"{description}"
                )

    except Exception as error:
        warnings.append(
            "Could not check interactions database: "
            f"{error}"
        )

    return warnings


def check_emergency_signals(
    user_query: str,
) -> bool:
    """
    Return True if emergency signals are detected
    in the original user query.
    """

    emergency_keywords = [
        "chest pain",
        "can't breathe",
        "cannot breathe",
        "difficulty breathing",
        "unconscious",
        "overdose",
        "swallowed too many",
        "severe bleeding",
        "stroke",
        "heart attack",
        "anaphylaxis",
        "throat closing",
    ]

    query_lower = str(
        user_query or ""
    ).casefold()

    return any(
        keyword in query_lower
        for keyword in emergency_keywords
    )


def validate_recommendation(
    user_query: str,
    recommended_medicines: list[str],
    requires_prescription: dict[str, Any] | None,
    has_prescription: bool = False,
) -> dict[str, Any]:
    """
    Perform the full safety validation.

    Prescription information supplied by the agents takes
    priority. The local OTC list is used only as a fallback
    when the supplied dictionary has no value for a medicine.
    """

    issues: list[str] = []
    warnings: list[str] = []

    medicines = [
        str(medicine).strip()
        for medicine in (
            recommended_medicines or []
        )
        if str(medicine).strip()
    ]

    # Check 1 — Emergency signals
    if check_emergency_signals(user_query):
        issues.append(
            "Emergency signals detected in query — "
            "do not recommend medicines"
        )

    # Check 2 — Prescription requirements
    supplied_rx_map = normalize_prescription_map(
        requires_prescription
    )

    fallback_rx_map = (
        check_prescription_requirements(
            medicines
        )
    )

    prescription_requirements_used: dict[
        str,
        bool,
    ] = {}

    for medicine in medicines:
        medicine_key = (
            normalize_medicine_name(medicine)
        )

        if medicine_key in supplied_rx_map:
            needs_prescription = (
                supplied_rx_map[medicine_key]
            )
        else:
            needs_prescription = (
                fallback_rx_map.get(
                    medicine,
                    True,
                )
            )

        prescription_requirements_used[
            medicine
        ] = needs_prescription

        if (
            needs_prescription
            and not has_prescription
        ):
            issues.append(
                f"{medicine} requires a "
                "prescription — cannot be "
                "dispensed without one"
            )

        elif (
            needs_prescription
            and has_prescription
        ):
            warnings.append(
                f"{medicine} requires a "
                "prescription — user has "
                "confirmed they have one"
            )

    # Check 3 — Dangerous combinations
    if len(medicines) > 1:
        combination_warnings = (
            check_dangerous_combinations(
                medicines
            )
        )

        if combination_warnings:
            issues.extend(
                combination_warnings
            )

    # Determine the validation status
    if issues:
        status = "REJECTED"

        fixable = not any(
            "DANGEROUS" in issue
            or "Emergency" in issue
            for issue in issues
        )
    else:
        status = "APPROVED"
        fixable = False

    return {
        "status": status,
        "issues": issues,
        "warnings": warnings,
        "fixable": fixable,
        "checked_medicines": medicines,
        "prescription_requirements_used": (
            prescription_requirements_used
        ),
    }


if __name__ == "__main__":
    test_cases = [
        {
            "name": (
                "Cetirizine without prescription"
            ),
            "user_query": (
                "Where can I find cetirizine?"
            ),
            "recommended_medicines": [
                "cetirizine"
            ],
            "requires_prescription": {
                "cetirizine": False
            },
            "has_prescription": False,
        },
        {
            "name": (
                "Fluconazole without prescription"
            ),
            "user_query": (
                "Where can I find fluconazole?"
            ),
            "recommended_medicines": [
                "fluconazole"
            ],
            "requires_prescription": {
                "fluconazole": True
            },
            "has_prescription": False,
        },
        {
            "name": (
                "Amoxicillin with prescription"
            ),
            "user_query": (
                "I need amoxicillin"
            ),
            "recommended_medicines": [
                "amoxicillin"
            ],
            "requires_prescription": {
                "amoxicillin": True
            },
            "has_prescription": True,
        },
    ]

    for test_case in test_cases:
        result = validate_recommendation(
            user_query=(
                test_case["user_query"]
            ),
            recommended_medicines=(
                test_case[
                    "recommended_medicines"
                ]
            ),
            requires_prescription=(
                test_case[
                    "requires_prescription"
                ]
            ),
            has_prescription=(
                test_case["has_prescription"]
            ),
        )

        print("=" * 60)
        print(test_case["name"])
        print(result)
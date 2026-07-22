import pandas as pd
from pathlib import Path

INTERACTIONS_PATH = Path("data/interactions.csv")
GUIDELINES_PATH = Path("data/pharmacist_guidelines.txt")

# OTC medicines that don't need a prescription
OTC_MEDICINES = {
    "acetaminophen", "paracetamol", "ibuprofen",
    "aspirin", "loratadine", "omeprazole"
}

# Maximum safe daily doses in mg
MAX_DAILY_DOSES = {
    "acetaminophen": 4000,
    "paracetamol": 4000,
    "ibuprofen": 1200,
    "aspirin": 4000,
    "loratadine": 10,
    "omeprazole": 40
}

# Dangerous combinations
DANGEROUS_PAIRS = [
    ("ibuprofen", "aspirin"),
    ("ibuprofen", "lisinopril"),
    ("aspirin", "lisinopril"),
]


def check_prescription_requirements(medicines: list[str]) -> dict:
    """
    Check which medicines require a prescription.
    Returns dict of medicine -> requires_prescription bool.
    """
    result = {}
    for med in medicines:
        med_lower = med.lower().strip()
        result[med] = med_lower not in OTC_MEDICINES
    return result


def check_dangerous_combinations(medicines: list[str]) -> list[str]:
    """
    Check if any medicine combination is dangerous.
    Returns list of warning strings.
    """
    warnings = []
    medicines_lower = [m.lower().strip() for m in medicines]

    for drug_a, drug_b in DANGEROUS_PAIRS:
        if drug_a in medicines_lower and drug_b in medicines_lower:
            warnings.append(
                f"DANGEROUS COMBINATION: {drug_a} and {drug_b} should not be taken together"
            )

    # Also check interactions CSV
    try:
        df = pd.read_csv(INTERACTIONS_PATH)
        for _, row in df.iterrows():
            if (row["drug_a"] in medicines_lower and
                row["drug_b"] in medicines_lower and
                    row["severity"] in ["moderate", "major"]):
                warnings.append(
                    f"INTERACTION ({row['severity']}): {row['drug_a']} + "
                    f"{row['drug_b']}: {row['description']}"
                )
    except Exception as e:
        warnings.append(f"Could not check interactions database: {e}")

    return warnings


def check_emergency_signals(user_query: str) -> bool:
    """
    Double-check for any emergency signals in the original query.
    Returns True if emergency signals detected.
    """
    emergency_keywords = [
        "chest pain", "can't breathe", "cannot breathe",
        "difficulty breathing", "unconscious", "overdose",
        "swallowed too many", "severe bleeding", "stroke",
        "heart attack", "anaphylaxis", "throat closing"
    ]
    query_lower = user_query.lower()
    return any(keyword in query_lower for keyword in emergency_keywords)


def validate_recommendation(
    user_query: str,
    recommended_medicines: list[str],
    requires_prescription: dict,
    has_prescription: bool = False
) -> dict:
    """
    Full safety validation of a medical recommendation.
    Returns validation result with status and any issues found.
    """
    issues = []
    warnings = []

    # Check 1 — Emergency signals
    if check_emergency_signals(user_query):
        issues.append("Emergency signals detected in query — do not recommend medicines")

    # Check 2 — Prescription requirements
    rx_check = check_prescription_requirements(recommended_medicines)
    for med, needs_rx in rx_check.items():
        if needs_rx and not has_prescription:
            issues.append(
                f"{med} requires a prescription — cannot be dispensed without one"
            )
        # FIXED: If needs_rx AND has_prescription → no issue, just add a warning
        elif needs_rx and has_prescription:
            warnings.append(
                f"{med} requires a prescription — user has confirmed they have one"
            )

    # Check 3 — Dangerous combinations
    if len(recommended_medicines) > 1:
        combo_warnings = check_dangerous_combinations(recommended_medicines)
        if combo_warnings:
            issues.extend(combo_warnings)

    # Determine status
    if issues:
        status = "REJECTED"
        fixable = not any("DANGEROUS" in i or "Emergency" in i for i in issues)
    else:
        status = "APPROVED"
        fixable = False

    return {
        "status": status,
        "issues": issues,
        "warnings": warnings,
        "fixable": fixable,
        "checked_medicines": recommended_medicines
    }
if __name__ == "__main__":
    result = validate_recommendation(
        user_query="I need amoxicillin for my infection",
        recommended_medicines=["amoxicillin"],
        requires_prescription={"amoxicillin": True},
        has_prescription=True
    )
    print(result)
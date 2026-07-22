from typing import TypedDict, Optional


class AgentState(TypedDict):
    # Input
    user_query: str
    user_lat: float
    user_lng: float
    has_prescription: bool

    # Triage output
    intent: str
    symptoms: list[str]
    medicines_mentioned: list[str]
    urgency: str

    # Medical agent output
    recommended_medicines: list[str]
    requires_prescription: dict
    medical_answer: str
    citations: list[str]
    medical_warnings: list[str]

    # Pharmacy agent output
    pharmacy_options: dict
    pharmacy_summary: str

    # Validator output
    validation_status: str
    final_answer: str
    issues_summary: str
    emergency_response: Optional[str]
    fixable: bool

    # Trace — records which agents fired and what they did
    trace: list[str]

    # Retry counter for validation loop
    retry_count: int
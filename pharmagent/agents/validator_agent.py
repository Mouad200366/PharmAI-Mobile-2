import os
import json
from pathlib import Path
from dotenv import load_dotenv
from langchain_ollama import ChatOllama
from langchain_core.messages import SystemMessage, HumanMessage

from tools.safety_tools import validate_recommendation

load_dotenv()

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
LLM_MODEL = os.getenv("LLM_MODEL", "qwen2.5:7b")
PROMPT_PATH = Path("agents/prompts/validator.txt")


def load_prompt() -> str:
    return PROMPT_PATH.read_text(encoding="utf-8")


def run_validator_agent(
    user_query: str,
    recommended_medicines: list[str],
    requires_prescription: dict,
    proposed_answer: str,
    has_prescription: bool = False
) -> dict:
    """
    Validate a medical recommendation for safety.
    Returns approved or rejected status with final answer.
    """
    print(f"[Validator Agent] Validating recommendation for: {recommended_medicines}")
    print(f"[Validator Agent] has_prescription flag: {has_prescription}")

    # Step 1 — Run safety checks
    safety_result = validate_recommendation(
        user_query=user_query,
        recommended_medicines=recommended_medicines,
        requires_prescription=requires_prescription,
        has_prescription=has_prescription
    )

    print(f"[Validator Agent] Safety check status: {safety_result['status']}")
    if safety_result["issues"]:
        print(f"[Validator Agent] Issues found: {safety_result['issues']}")

    # FIXED: Step 2 — If safety check APPROVED, skip LLM entirely and return directly
    if safety_result["status"] == "APPROVED":
        print(f"[Validator Agent] Safety check passed — approving without LLM override")
        return {
            "status": "APPROVED",
            "fixable": False,
            "final_answer": proposed_answer,
            "issues_summary": "",
            "emergency_response": None,
            "safety_check": safety_result
        }

    # Step 3 — Only call LLM when REJECTED to format a helpful rejection message
    llm = ChatOllama(
        model=LLM_MODEL,
        base_url=OLLAMA_BASE_URL,
        temperature=0,
        format="json"
    )

    user_message = f"""
Original user query: {user_query}
Recommended medicines: {recommended_medicines}
Safety check result: {json.dumps(safety_result, indent=2)}
Proposed answer from Medical Agent: {proposed_answer}

The safety check has REJECTED this recommendation.
Issues found: {safety_result['issues']}

Explain clearly to the user why this recommendation was rejected and what they should do instead.
Do NOT approve this recommendation — it has been rejected for safety reasons.
"""

    messages = [
        SystemMessage(content=load_prompt()),
        HumanMessage(content=user_message)
    ]

    print(f"[Validator Agent] Formatting rejection response...")
    response = llm.invoke(messages)
    raw = response.content.strip()

    try:
        result = json.loads(raw)
        result["status"] = "REJECTED"
        result["safety_check"] = safety_result
        result["fixable"] = safety_result["fixable"]
        print(f"[Validator Agent] Final status: REJECTED")
        return result
    except json.JSONDecodeError:
        return {
            "status": "REJECTED",
            "fixable": safety_result["fixable"],
            "final_answer": f"This recommendation was rejected: {safety_result['issues']}. Please consult a pharmacist.",
            "issues_summary": str(safety_result["issues"]),
            "emergency_response": None,
            "safety_check": safety_result
        }


if __name__ == "__main__":
    test_cases = [
        {
            "desc": "Safe OTC recommendation — should APPROVE",
            "user_query": "I have a headache",
            "recommended_medicines": ["acetaminophen"],
            "requires_prescription": {"acetaminophen": False},
            "proposed_answer": "Take acetaminophen 500mg every 6 hours for your headache."
        },
        {
            "desc": "Prescription medicine without prescription — should REJECT",
            "user_query": "I need amoxicillin",
            "recommended_medicines": ["amoxicillin"],
            "requires_prescription": {"amoxicillin": True},
            "proposed_answer": "Amoxicillin 500mg three times daily for infection."
        },
        {
            "desc": "Dangerous combination — should REJECT",
            "user_query": "can I take ibuprofen and aspirin together",
            "recommended_medicines": ["ibuprofen", "aspirin"],
            "requires_prescription": {"ibuprofen": False, "aspirin": False},
            "proposed_answer": "You can take both for better pain relief."
        },
        {
            "desc": "Emergency signal in query — should REJECT with emergency",
            "user_query": "I have chest pain and difficulty breathing",
            "recommended_medicines": ["aspirin"],
            "requires_prescription": {"aspirin": False},
            "proposed_answer": "Take aspirin 325mg immediately."
        }
    ]

    print("=" * 60)
    print("VALIDATOR AGENT TEST")
    print("=" * 60)

    for i, case in enumerate(test_cases, 1):
        print(f"\nTest {i}: {case['desc']}")
        print("-" * 40)
        result = run_validator_agent(
            user_query=case["user_query"],
            recommended_medicines=case["recommended_medicines"],
            requires_prescription=case["requires_prescription"],
            proposed_answer=case["proposed_answer"]
        )
        print(f"Status          : {result.get('status')}")
        print(f"Fixable         : {result.get('fixable')}")
        print(f"Issues summary  : {result.get('issues_summary')}")
        print(f"Emergency       : {result.get('emergency_response')}")
        print(f"Final answer    : {result.get('final_answer')}")
        print("=" * 60)
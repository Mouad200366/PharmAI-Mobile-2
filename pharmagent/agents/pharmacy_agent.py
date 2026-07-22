import os
import json
from pathlib import Path
from dotenv import load_dotenv
from langchain_ollama import ChatOllama
from langchain_core.messages import SystemMessage, HumanMessage

from tools.pharmacy_tools import (
    find_pharmacies_with_stock,
    get_all_open_pharmacies,
    get_night_shift_pharmacies
)

load_dotenv()

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
LLM_MODEL = os.getenv("LLM_MODEL", "qwen2.5:7b")

# Default user location — center of Casablanca
DEFAULT_LAT = 33.5731
DEFAULT_LNG = -7.5898


def run_pharmacy_agent(
    medicines: list[str],
    user_lat: float = DEFAULT_LAT,
    user_lng: float = DEFAULT_LNG
) -> dict:
    """
    Find pharmacies that have the requested medicines in stock and are open.
    Returns ranked pharmacy options with distance, price, and availability.
    """
    print(f"[Pharmacy Agent] Looking for medicines: {medicines}")

    all_pharmacy_results = {}

    for medicine in medicines:
        print(f"[Pharmacy Agent] Searching stock for: {medicine}")
        results = find_pharmacies_with_stock(medicine, user_lat, user_lng)
        all_pharmacy_results[medicine] = results
        print(f"[Pharmacy Agent] Found {len(results)} pharmacies with {medicine} in stock")

    # Build summary for LLM
    llm = ChatOllama(
        model=LLM_MODEL,
        base_url=OLLAMA_BASE_URL,
        temperature=0,
        format="json"
    )

    system_prompt = Path("agents/prompts/pharmacy.txt").read_text(encoding="utf-8")

    pharmacy_data = json.dumps(all_pharmacy_results, indent=2)

    user_message = f"""
Medicines requested: {medicines}
User location: lat={user_lat}, lng={user_lng}

Pharmacy search results:
{pharmacy_data}

Provide a structured summary of the best pharmacy options for the user.
"""

    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_message)
    ]

    print(f"[Pharmacy Agent] Formatting results with LLM...")
    response = llm.invoke(messages)
    raw = response.content.strip()

    try:
        result = json.loads(raw)
        # FIXED: Handle null top_pharmacy safely
        top = result.get('top_pharmacy') or {}
        print(f"[Pharmacy Agent] Top pharmacy: {top.get('name', 'none')}")
        return result
    except json.JSONDecodeError:
        # Return raw data if LLM formatting fails
        print(f"[Pharmacy Agent] WARNING: LLM formatting failed, returning raw data")
        return {
            "top_pharmacy": all_pharmacy_results,
            "all_options": all_pharmacy_results,
            "summary": "Pharmacy search completed.",
            "requires_prescription": {}
        }


if __name__ == "__main__":
    test_cases = [
        {"medicines": ["ibuprofen"], "desc": "Daytime ibuprofen search"},
        {"medicines": ["amoxicillin"], "desc": "Prescription medicine search"},
        {"medicines": ["acetaminophen", "loratadine"], "desc": "Multiple medicines"},
        {"medicines": ["insulin"], "desc": "Medicine not in stock anywhere"},
    ]

    print("=" * 60)
    print("PHARMACY AGENT TEST")
    print("=" * 60)

    for i, case in enumerate(test_cases, 1):
        print(f"\nTest {i}: {case['desc']}")
        print(f"Medicines: {case['medicines']}")
        print("-" * 40)
        result = run_pharmacy_agent(case["medicines"])
        # FIXED: Handle null top_pharmacy safely in test output too
        top = result.get('top_pharmacy') or {}
        print(f"Top pharmacy : {top.get('name', 'N/A')}")
        print(f"Summary      : {result.get('summary', 'N/A')}")
        print(f"Rx required  : {result.get('requires_prescription', {})}")
        print("=" * 60)
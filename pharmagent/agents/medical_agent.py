import os
import json
from pathlib import Path
from dotenv import load_dotenv
from langchain_ollama import ChatOllama
from langchain_core.messages import SystemMessage, HumanMessage

from tools.medical_tools import (
    get_medicine_info,
    get_symptom_treatment,
    get_drug_interactions
)

load_dotenv()

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
LLM_MODEL = os.getenv("LLM_MODEL", "qwen2.5:7b")
PROMPT_PATH = Path("agents/prompts/medical.txt")


def load_prompt() -> str:
    return PROMPT_PATH.read_text(encoding="utf-8")


def run_medical_agent(
    user_query: str,
    intent: str,
    symptoms: list[str],
    medicines_mentioned: list[str]
) -> dict:
    """
    Answer a medical question using RAG-retrieved context.
    Returns structured medical information with citations.
    """
    llm = ChatOllama(
        model=LLM_MODEL,
        base_url=OLLAMA_BASE_URL,
        temperature=0,
        format="json"
    )

    # Step 1 — Retrieve relevant context based on intent
    print(f"[Medical Agent] Retrieving context for intent: {intent}")
    context_parts = []

    if intent == "SYMPTOM_QUERY" and symptoms:
        symptom_text = ", ".join(symptoms)
        print(f"[Medical Agent] Searching symptom treatment for: {symptom_text}")
        context_parts.append(get_symptom_treatment(symptom_text))

    if intent == "MEDICINE_QUERY" and medicines_mentioned:
        for med in medicines_mentioned:
            print(f"[Medical Agent] Searching medicine info for: {med}")
            context_parts.append(get_medicine_info(med))

    if intent == "GENERAL_INFO":
        print(f"[Medical Agent] Searching general info for: {user_query}")
        context_parts.append(get_medicine_info(user_query))

    # Always check interactions if multiple medicines mentioned
    if len(medicines_mentioned) > 1:
        for med in medicines_mentioned:
            print(f"[Medical Agent] Checking interactions for: {med}")
            context_parts.append(get_drug_interactions(med))
    elif len(medicines_mentioned) == 1:
        context_parts.append(get_drug_interactions(medicines_mentioned[0]))

    # Step 2 — Build the prompt with retrieved context
    context = "\n\n===\n\n".join(context_parts) if context_parts else "No specific context retrieved."

    user_message = f"""
User Query: {user_query}
Intent: {intent}
Symptoms: {symptoms}
Medicines mentioned: {medicines_mentioned}

Retrieved Medical Context:
{context}

Based on the context above, provide your structured medical response.
"""

    # Step 3 — Call the LLM
    messages = [
        SystemMessage(content=load_prompt()),
        HumanMessage(content=user_message)
    ]

    print(f"[Medical Agent] Calling LLM with retrieved context...")
    response = llm.invoke(messages)
    raw = response.content.strip()

    try:
        result = json.loads(raw)
        print(f"[Medical Agent] Recommended: {result.get('recommended_medicines')}")
        return result
    except json.JSONDecodeError:
        print(f"[Medical Agent] WARNING: Could not parse JSON. Raw: {raw[:200]}")
        return {
            "recommended_medicines": [],
            "requires_prescription": {},
            "dosage_info": {},
            "warnings": [],
            "interactions_found": [],
            "answer": "I could not retrieve sufficient medical information for this query.",
            "citations": []
        }


if __name__ == "__main__":
    test_cases = [
        {
            "user_query": "I have a sore throat and mild fever since yesterday",
            "intent": "SYMPTOM_QUERY",
            "symptoms": ["sore throat", "mild fever"],
            "medicines_mentioned": []
        },
        {
            "user_query": "I need ibuprofen 400mg",
            "intent": "MEDICINE_QUERY",
            "symptoms": [],
            "medicines_mentioned": ["ibuprofen"]
        },
        {
            "user_query": "can I take paracetamol and ibuprofen together?",
            "intent": "GENERAL_INFO",
            "symptoms": [],
            "medicines_mentioned": ["paracetamol", "ibuprofen"]
        }
    ]

    print("=" * 60)
    print("MEDICAL AGENT TEST")
    print("=" * 60)

    for i, case in enumerate(test_cases, 1):
        print(f"\nTest {i}: {case['user_query']}")
        print("-" * 40)
        result = run_medical_agent(
            case["user_query"],
            case["intent"],
            case["symptoms"],
            case["medicines_mentioned"]
        )
        print(f"Recommended : {result.get('recommended_medicines')}")
        print(f"Rx required : {result.get('requires_prescription')}")
        print(f"Warnings    : {result.get('warnings')}")
        print(f"Interactions: {result.get('interactions_found')}")
        print(f"Answer      : {result.get('answer')}")
        print(f"Citations   : {result.get('citations')}")
        print("=" * 60)
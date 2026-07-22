import os
import json
from pathlib import Path
from dotenv import load_dotenv
from langchain_ollama import ChatOllama
from langchain_core.messages import SystemMessage, HumanMessage

load_dotenv()

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
LLM_MODEL = os.getenv("LLM_MODEL", "qwen2.5:7b")

PROMPT_PATH = Path("agents/prompts/triage.txt")


def load_prompt() -> str:
    return PROMPT_PATH.read_text(encoding="utf-8")


def run_triage_agent(user_message: str) -> dict:
    """
    Classify the user's message into an intent with extracted entities.
    Returns a structured dict with intent, symptoms, medicines, urgency.
    """
    llm = ChatOllama(
        model=LLM_MODEL,
        base_url=OLLAMA_BASE_URL,
        temperature=0,
        format="json"
    )

    system_prompt = load_prompt()

    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_message)
    ]

    print(f"[Triage Agent] Analyzing: '{user_message}'")
    response = llm.invoke(messages)
    raw = response.content.strip()

    try:
        result = json.loads(raw)
        print(f"[Triage Agent] Intent: {result.get('intent')} | Urgency: {result.get('urgency')}")
        return result
    except json.JSONDecodeError:
        print(f"[Triage Agent] WARNING: Could not parse JSON. Raw response: {raw}")
        return {
            "intent": "GENERAL_INFO",
            "symptoms": [],
            "medicines_mentioned": [],
            "urgency": "low",
            "reasoning": "Failed to parse response, defaulting to general info"
        }


if __name__ == "__main__":
    test_cases = [
        "I have a sore throat and mild fever since yesterday",
        "I need ibuprofen 400mg",
        "What are the side effects of aspirin?",
        "I have crushing chest pain and I can't breathe properly",
        "my head hurts and I keep sneezing",
        "do you have amoxicillin in stock?",
        "I think I swallowed too many pills by accident",
        "can I take paracetamol and ibuprofen together?"
    ]

    print("=" * 60)
    print("TRIAGE AGENT TEST")
    print("=" * 60)

    for i, test in enumerate(test_cases, 1):
        print(f"\nTest {i}: {test}")
        print("-" * 40)
        result = run_triage_agent(test)
        print(f"Intent   : {result.get('intent')}")
        print(f"Symptoms : {result.get('symptoms')}")
        print(f"Medicines: {result.get('medicines_mentioned')}")
        print(f"Urgency  : {result.get('urgency')}")
        print(f"Reasoning: {result.get('reasoning')}")
        print("=" * 60)
"""
RAG vs No-RAG Comparison Demo

Runs the same medical query through:
  (a) raw qwen2.5 with no tools and no RAG
  (b) the full Pharmagent multi-agent system

Shows the difference clearly — proves the value of the RAG-grounded agent architecture.
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from langchain_ollama import ChatOllama
from langchain_core.messages import SystemMessage, HumanMessage

sys.path.append(str(Path(__file__).parent.parent))

from orchestration.graph import run_pipeline

load_dotenv()

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
LLM_MODEL = os.getenv("LLM_MODEL", "qwen2.5:7b")


def query_raw_llm(user_query: str) -> str:
    """Ask the LLM directly with no RAG, no tools, no agents."""
    llm = ChatOllama(
        model=LLM_MODEL,
        base_url=OLLAMA_BASE_URL,
        temperature=0
    )

    messages = [
        SystemMessage(content=(
            "You are a pharmacy assistant. Answer the user's medical question "
            "with specific medicine names, dosages, and pharmacy locations near them. "
            "Be concrete and direct."
        )),
        HumanMessage(content=user_query)
    ]

    response = llm.invoke(messages)
    return response.content.strip()


def run_comparison(user_query: str):
    """Run the same query through both systems and print results side-by-side."""
    print("=" * 80)
    print(f"QUERY: {user_query}")
    print("=" * 80)

    # ── A: Raw LLM
    print("\n┌─────────────────────────────────────────────────────────────")
    print("│ (A) RAW QWEN2.5 — no RAG, no tools, no agents")
    print("└─────────────────────────────────────────────────────────────")
    raw_response = query_raw_llm(user_query)
    print(raw_response)

    # ── B: Pharmagent
    print("\n┌─────────────────────────────────────────────────────────────")
    print("│ (B) PHARMAGENT — 4 agents + RAG + safety validation")
    print("└─────────────────────────────────────────────────────────────")
    result = run_pipeline(user_query)
    print(result["final_answer"])
    if result.get("pharmacy_summary"):
        print(f"\nPharmacy info: {result['pharmacy_summary']}")
    if result.get("citations"):
        print(f"\nSources: {', '.join(result['citations'])}")
    print(f"\nValidation status: {result['validation_status']}")

    print("\n" + "=" * 80)
    print("ANALYSIS")
    print("=" * 80)
    print(
        "The raw LLM tends to invent pharmacy names, addresses, and exact dosages\n"
        "that may not match real safe guidelines. Pharmagent retrieves real data\n"
        "from indexed medicine leaflets and the actual pharmacy database, then\n"
        "validates the recommendation for safety before showing it to the user.\n"
    )


if __name__ == "__main__":
    test_queries = [
        "I have a sore throat and mild fever. What should I take and where?",
        "I need ibuprofen. Where can I buy it near me in Casablanca?",
    ]

    for query in test_queries:
        run_comparison(query)
        print("\n" * 2)
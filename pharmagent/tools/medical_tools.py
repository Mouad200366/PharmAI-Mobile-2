import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from rag.retrievers import (
    search_medicine_info,
    search_symptom_treatment,
    search_drug_interactions,
    format_results_for_agent
)


def get_medicine_info(query: str) -> str:
    """Search for general medicine information, dosage, and contraindications."""
    results = search_medicine_info(query, top_k=3)
    return format_results_for_agent(results)


def get_symptom_treatment(symptoms: str) -> str:
    """Search for recommended treatments based on symptoms described."""
    results = search_symptom_treatment(symptoms, top_k=3)
    return format_results_for_agent(results)


def get_drug_interactions(medicine_name: str) -> str:
    """Search for known drug interactions for a specific medicine."""
    results = search_drug_interactions(medicine_name, top_k=3)
    return format_results_for_agent(results)
from langgraph.graph import StateGraph, END
from orchestration.state import AgentState
from agents.triage_agent import run_triage_agent
from agents.medical_agent import run_medical_agent
from agents.pharmacy_agent import run_pharmacy_agent
from agents.validator_agent import run_validator_agent

# Default Casablanca center coordinates
DEFAULT_LAT = 33.5731
DEFAULT_LNG = -7.5898


# ─── Node functions ───────────────────────────────────────────

def triage_node(state: AgentState) -> AgentState:
    print("\n[Graph] Running Triage Node...")
    result = run_triage_agent(state["user_query"])

    state["intent"] = result.get("intent", "GENERAL_INFO")
    state["symptoms"] = result.get("symptoms", [])
    state["medicines_mentioned"] = result.get("medicines_mentioned", [])
    state["urgency"] = result.get("urgency", "low")
    state["trace"].append(
        f"Triage → intent={state['intent']}, "
        f"symptoms={state['symptoms']}, "
        f"medicines={state['medicines_mentioned']}"
    )
    return state


def medical_node(state: AgentState) -> AgentState:
    print("\n[Graph] Running Medical Knowledge Node...")

    # Increment retry counter if this is a retry
    if state.get("retry_count", 0) == 0 and state.get("validation_status") == "REJECTED":
        state["retry_count"] = 1

    result = run_medical_agent(
        user_query=state["user_query"],
        intent=state["intent"],
        symptoms=state["symptoms"],
        medicines_mentioned=state["medicines_mentioned"]
    )

    state["recommended_medicines"] = result.get("recommended_medicines", [])
    state["requires_prescription"] = result.get("requires_prescription", {})
    state["medical_answer"] = result.get("answer", "")
    state["citations"] = result.get("citations", [])
    state["medical_warnings"] = result.get("warnings", [])
    state["trace"].append(
        f"Medical → recommended={state['recommended_medicines']}, "
        f"citations={len(state['citations'])}"
    )
    return state


def pharmacy_node(state: AgentState) -> AgentState:
    print("\n[Graph] Running Pharmacy Node...")

    medicines = state["recommended_medicines"] or state["medicines_mentioned"]

    if not medicines:
        state["pharmacy_summary"] = "No medicines to search for."
        state["pharmacy_options"] = {}
        state["trace"].append("Pharmacy → skipped (no medicines)")
        return state

    result = run_pharmacy_agent(
        medicines=medicines,
        user_lat=state.get("user_lat", DEFAULT_LAT),
        user_lng=state.get("user_lng", DEFAULT_LNG)
    )

    state["pharmacy_options"] = result.get("all_options", {})
    state["pharmacy_summary"] = result.get("summary", "")

    # Merge prescription info from pharmacy agent
    rx_info = result.get("requires_prescription", {})
    state["requires_prescription"].update(rx_info)

    state["trace"].append(
        f"Pharmacy → found options, summary ready"
    )
    return state


def validator_node(state: AgentState) -> AgentState:
    print("\n[Graph] Running Validator Node...")
    result = run_validator_agent(
        user_query=state["user_query"],
        recommended_medicines=state["recommended_medicines"],
        requires_prescription=state["requires_prescription"],
        proposed_answer=state["medical_answer"],
        has_prescription=state.get("has_prescription", False)
    )

    state["validation_status"] = result.get("status", "REJECTED")
    state["final_answer"] = result.get("final_answer", "")
    state["issues_summary"] = result.get("issues_summary", "")
    state["emergency_response"] = result.get("emergency_response")
    state["fixable"] = result.get("fixable", False)
    state["trace"].append(
        f"Validator → status={state['validation_status']}, "
        f"fixable={state['fixable']}"
    )
    return state


def emergency_node(state: AgentState) -> AgentState:
    print("\n[Graph] EMERGENCY detected — bypassing all agents")
    state["validation_status"] = "EMERGENCY"
    state["final_answer"] = (
        "⚠️ EMERGENCY: Your symptoms require immediate medical attention. "
        "Please call emergency services (15 or 190 in Morocco) or go to "
        "the nearest emergency room immediately. Do not wait."
    )
    state["emergency_response"] = state["final_answer"]
    state["trace"].append("Emergency → immediate response, pipeline stopped")
    return state


# ─── Routing functions ────────────────────────────────────────

def route_after_triage(state: AgentState) -> str:
    """Decide where to go after triage."""
    if state["intent"] == "EMERGENCY" or state["urgency"] == "high":
        return "emergency"
    return "medical"


def route_after_validator(state: AgentState) -> str:
    """
    After validation:
    - APPROVED → end
    - REJECTED + fixable + not retried → retry via medical
    - REJECTED + not fixable → end
    """
    if state["validation_status"] == "APPROVED":
        return "end"
    if state["fixable"] and state.get("retry_count", 0) < 1:
        print(f"[Graph] Validation rejected but fixable — retrying once")
        return "retry"
    return "end"


# ─── Build the graph ──────────────────────────────────────────

def build_graph():
    graph = StateGraph(AgentState)

    # Add nodes
    graph.add_node("triage", triage_node)
    graph.add_node("medical", medical_node)
    graph.add_node("pharmacy", pharmacy_node)
    graph.add_node("validator", validator_node)
    graph.add_node("emergency", emergency_node)

    # Entry point
    graph.set_entry_point("triage")

    # Edges
    graph.add_conditional_edges(
        "triage",
        route_after_triage,
        {
            "emergency": "emergency",
            "medical": "medical"
        }
    )

    graph.add_edge("medical", "pharmacy")
    graph.add_edge("pharmacy", "validator")

    graph.add_conditional_edges(
        "validator",
        route_after_validator,
        {
            "end": END,
            "retry": "medical"
        }
    )

    graph.add_edge("emergency", END)

    return graph.compile()


def run_pipeline(
    user_query: str,
    user_lat: float = DEFAULT_LAT,
    user_lng: float = DEFAULT_LNG,
    has_prescription: bool = False
) -> AgentState:
    """
    Run the full multi-agent pipeline for a user query.
    Returns the final state with answer and trace.
    """
    app = build_graph()

    initial_state: AgentState = {
        "user_query": user_query,
        "user_lat": user_lat,
        "user_lng": user_lng,
        "has_prescription": has_prescription,
        "intent": "",
        "symptoms": [],
        "medicines_mentioned": [],
        "urgency": "low",
        "recommended_medicines": [],
        "requires_prescription": {},
        "medical_answer": "",
        "citations": [],
        "medical_warnings": [],
        "pharmacy_options": {},
        "pharmacy_summary": "",
        "validation_status": "",
        "final_answer": "",
        "issues_summary": "",
        "emergency_response": None,
        "fixable": False,
        "trace": [],
        "retry_count": 0
    }

    print(f"\n{'='*60}")
    print(f"Query: {user_query}")
    print(f"{'='*60}")

    final_state = app.invoke(initial_state)
    return final_state


if __name__ == "__main__":
    test_scenarios = [
        {
            "desc": "Symptom query — full pipeline",
            "query": "I have a sore throat and mild fever since yesterday",
            "has_prescription": False
        },
        {
            "desc": "Medicine query — OTC",
            "query": "I need ibuprofen 400mg",
            "has_prescription": False
        },
        {
            "desc": "Emergency — bypass all agents",
            "query": "I have crushing chest pain and I cannot breathe",
            "has_prescription": False
        },
        {
            "desc": "Prescription medicine — no prescription — should REJECT",
            "query": "I need amoxicillin for my infection",
            "has_prescription": False
        },
        {
            "desc": "Prescription medicine — with prescription — should APPROVE",
            "query": "I need amoxicillin for my infection",
            "has_prescription": True
        },
        {
            "desc": "General info query",
            "query": "What are the side effects of aspirin?",
            "has_prescription": False
        },
        {
            "desc": "Medicine not in stock",
            "query": "I need insulin",
            "has_prescription": True
        },
        {
            "desc": "Dangerous combination query",
            "query": "can I take ibuprofen and aspirin together for my back pain",
            "has_prescription": False
        }
    ]

    print("\n" + "="*60)
    print("FULL END-TO-END TEST — 8 SCENARIOS")
    print("="*60)

    results_summary = []

    for i, scenario in enumerate(test_scenarios, 1):
        print(f"\n[Scenario {i}/8] {scenario['desc']}")
        result = run_pipeline(
            user_query=scenario["query"],
            has_prescription=scenario.get("has_prescription", False)
        )
        status = result["validation_status"]
        results_summary.append({
            "scenario": scenario["desc"],
            "status": status,
            "answer_preview": result["final_answer"][:80] + "..."
        })
        print(f"Status  : {status}")
        print(f"Answer  : {result['final_answer'][:120]}...")
        print(f"Trace   : {' → '.join(result['trace'])}")

    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    for r in results_summary:
        print(f"[{r['status']:10}] {r['scenario']}")
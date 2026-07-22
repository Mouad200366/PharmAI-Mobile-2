from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from orchestration.graph import run_pipeline

app = FastAPI(title="PharmaAssist API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve frontend static files
app.mount("/app", StaticFiles(directory="frontend", html=True), name="frontend")


# ─── Request / Response models ────────────────────────────────

class AssistRequest(BaseModel):
    user_query: str
    user_lat: float = 33.5731
    user_lng: float = -7.5898
    has_prescription: bool = False


class AssistResponse(BaseModel):
    status: str
    final_answer: str
    recommended_medicines: list[str]
    pharmacy_summary: str
    citations: list[str]
    warnings: list[str]
    issues_summary: str
    emergency_response: str | None
    trace: list[str]


# ─── Endpoints ────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "message": "PharmaAssist API is running"}


@app.post("/assist", response_model=AssistResponse)
def assist(request: AssistRequest):
    """
    Main endpoint — runs the full multi-agent pipeline.
    Accepts a user query and returns the final answer with trace.
    """
    try:
        result = run_pipeline(
            user_query=request.user_query,
            user_lat=request.user_lat,
            user_lng=request.user_lng,
            has_prescription=request.has_prescription
        )

        return AssistResponse(
            status=result.get("validation_status", "UNKNOWN"),
            final_answer=result.get("final_answer", ""),
            recommended_medicines=result.get("recommended_medicines", []),
            pharmacy_summary=result.get("pharmacy_summary", ""),
            citations=result.get("citations", []),
            warnings=result.get("medical_warnings", []),
            issues_summary=result.get("issues_summary", ""),
            emergency_response=result.get("emergency_response"),
            trace=result.get("trace", [])
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
from fastapi.responses import StreamingResponse
import json as json_lib
import asyncio
from orchestration.graph import build_graph, DEFAULT_LAT, DEFAULT_LNG


@app.post("/assist-stream")
async def assist_stream(request: AssistRequest):
    """
    Streaming endpoint — sends each agent step as a Server-Sent Event
    so the frontend can show the pipeline animating in real-time.
    """
    async def event_generator():
        app_graph = build_graph()

        initial_state = {
            "user_query": request.user_query,
            "user_lat": request.user_lat,
            "user_lng": request.user_lng,
            "has_prescription": request.has_prescription,
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

        final_state = None
        try:
            for event in app_graph.stream(initial_state):
                # event is a dict like {"node_name": new_state}
                for node_name, node_state in event.items():
                    payload = {
                        "type": "agent_step",
                        "agent": node_name,
                        "trace": node_state.get("trace", []),
                        "intent": node_state.get("intent"),
                        "recommended_medicines": node_state.get("recommended_medicines", []),
                    }
                    yield f"data: {json_lib.dumps(payload)}\n\n"
                    final_state = node_state
                    await asyncio.sleep(0.1)

            # Final event with full response
            final_payload = {
                "type": "final",
                "status": final_state.get("validation_status", "UNKNOWN"),
                "final_answer": final_state.get("final_answer", ""),
                "recommended_medicines": final_state.get("recommended_medicines", []),
                "pharmacy_summary": final_state.get("pharmacy_summary", ""),
                "pharmacy_options": final_state.get("pharmacy_options", {}),
                "citations": final_state.get("citations", []),
                "warnings": final_state.get("medical_warnings", []),
                "issues_summary": final_state.get("issues_summary", ""),
                "emergency_response": final_state.get("emergency_response"),
                "trace": final_state.get("trace", []),
            }
            yield f"data: {json_lib.dumps(final_payload)}\n\n"

        except Exception as e:
            error_payload = {"type": "error", "error": str(e)}
            yield f"data: {json_lib.dumps(error_payload)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
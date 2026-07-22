# Technical Choices — Pharmagent

Justification for every major decision in the project. This is the document to read before the soutenance — it answers most of the individual code questions you might be asked.

---

## LLM: Ollama + qwen2.5:7b

**Why Ollama**: runs locally, no API cost during 15 days of development, no rate limits, offline-capable.

**Why qwen2.5:7b specifically**: in our testing it followed JSON-output instructions more reliably than Llama 3.1 8B and Mistral 7B, which matters because every agent in the system depends on parseable structured output. It's also small enough to run on a laptop with 8GB RAM.

**Alternative considered**: Claude API or GPT-4. These would give better quality but introduce cost and would conflict with the cahier's free-choice constraint by tying the project to a paid service.

---

## Embeddings: nomic-embed-text

**Why**: free, runs in the same Ollama instance as the LLM, decent quality for English medical text. We use English embeddings because the corpus is in English (DailyMed PDFs).

**Alternative considered**: sentence-transformers. We didn't need a second Python dependency since Ollama already runs.

---

## Vector store: ChromaDB

**Why**: zero infrastructure (no Docker, no separate server), persistent on disk, excellent LlamaIndex integration, perfect for a 200-chunk corpus.

**Alternative considered**: FAISS — faster but more setup. Pinecone — adds cloud dependency.

---

## RAG framework: LlamaIndex

**Required by the cahier des charges**. Beyond that, LlamaIndex has a cleaner abstraction for document loading, chunking, and metadata-aware retrieval than building it from scratch.

---

## Chunking strategy

**Default LlamaIndex chunking with metadata enrichment per document type**:

- Medicine leaflets are loaded as one Document each with `metadata={medicine_name, source, type}`. LlamaIndex then chunks them internally with overlap so semantic continuity is preserved across chunk boundaries.
- Drug interactions are stored as **one chunk per interaction pair** with `metadata={drug_a, drug_b, severity}`. This lets us filter interactions by drug name at retrieval time.
- Symptom guide and pharmacist guidelines are chunked with the default strategy.

**Why this works**: retrieval quality depends on chunks being semantically coherent units. A medicine leaflet is fundamentally about one medicine, so keeping the metadata `medicine_name` lets us trace any retrieved chunk back to its source for citations.

**Alternative considered**: chunking by leaflet section (Indications, Dosage, etc.). We tested this and it caused some retrievals to miss cross-section context. The current strategy retrieves better overall.

---

## Agent framework: LangChain

**Required by the cahier des charges**. We use LangChain primarily for tool definitions, message types (SystemMessage, HumanMessage), and the ChatOllama wrapper.

---

## Orchestration: LangGraph (not pure LangChain)

**Why LangGraph specifically**:
- The cahier asks for orchestration that's "sequential, parallel, or conditional" — Pharmagent uses **conditional** routing (Triage decides where to go, Validator can loop back)
- LangGraph is built for this — explicit state graph, conditional edges, native state management
- Pure LangChain `SequentialChain` cannot express the emergency-bypass branch or the validator retry loop cleanly

**State is a TypedDict** (`orchestration/state.py`) passed through every node and accumulates a `trace` field for the agent activity visualization.

---

## Why four agents (and not fewer)

The cahier asks for a *system* of agents, not one big agent with many tools. Each agent has a clear, defensible separation of concern:

- **Triage** is cheap (no tools, fast) so it runs first and protects the more expensive agents from useless calls
- **Medical** owns RAG and medical reasoning
- **Pharmacy** owns operational data (stock, hours, location)
- **Validator** is the safety net — it's the only agent that can REJECT a response

You could merge Medical and Pharmacy into one agent with both toolsets, but that would muddy the responsibilities and make defense harder ("which part is the RAG part?"). Separation matches the cahier example architectures (Collector → Analyst → Writer → Verifier).

---

## Backend: FastAPI with streaming endpoint

**Why FastAPI**: async-native (needed for the streaming endpoint), auto-generated docs at `/docs`, type-safe with Pydantic.

**Why a streaming endpoint** (`/assist-stream`): the frontend animates the agent pipeline in real-time as each agent fires. Without streaming, the user would see a 10-second wait followed by everything appearing at once. With streaming via Server-Sent Events, each agent's completion is pushed to the client immediately.

We kept a non-streaming endpoint (`/assist`) as well, which is useful for curl/Postman testing and for programmatic integration.

---

## Frontend: vanilla HTML/CSS/JS

**Why no framework**: zero build step, easy to defend (no opaque tooling), the cahier doesn't require React. The frontend is intentionally small — 4 JS files, each with one responsibility:

- `app.js` — main chat logic, fetch with SSE streaming
- `pipeline.js` — animated agent pipeline on the right side
- `pharmacy-cards.js` — pharmacy results rendering
- `markdown.js` — minimal Markdown renderer for agent responses

---

## Safety as hardcoded rules + LLM (not LLM-only)

The Validator Agent runs **deterministic safety checks first** (`tools/safety_tools.py`) — prescription requirements, dangerous drug combinations, emergency keywords. **Only after the safety check passes** does the LLM get to write the final response.

**Why**: an LLM alone can be talked into approving unsafe recommendations through prompt injection or just inconsistency. Hardcoded rules give a deterministic floor of safety. The LLM only handles the natural-language explanation, not the safety decision.

---

## Mock pharmacy data instead of a real database

For the academic scope, mock JSON files (`pharmacies.json`, `stock.json`, `night_shift_schedule.json`) are sufficient. The Pharmacy Agent reads them through tool functions — replacing this with a real PostgreSQL/Mongo backend later would be a one-file change.

---

## Known limitations (be ready to discuss in defense)

1. **Triage agent doesn't always extract all medicine names** from a sentence like "can I take ibuprofen and aspirin together". The dangerous combination detection works perfectly in isolation but depends on triage extracting both names. Fix: improve the triage prompt with more examples of multi-medicine extraction.

2. **Medical advice has real liability**. The system is framed as orientation/information, not medical advice. Real deployment requires regulatory review.

3. **No prescription OCR**. The `has_prescription` flag is set by the user via a checkbox. A real system would verify the prescription image.

4. **Citations sometimes show "unknown leaflet"** when a chunk doesn't carry the `medicine_name` metadata (mainly text guides and interactions). Fix: enrich metadata at ingestion.
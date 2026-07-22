# Pharmagent — Intelligent Multi-Agent Pharmacy Assistant

> A multi-agent AI system that helps users find the right medicine and the nearest open pharmacy, using RAG-grounded medical knowledge and safety validation.

**Academic project — Distributed AI & Multi-Agent Systems module.**
Built with LangChain, LangGraph, LlamaIndex, ChromaDB, and Ollama.

---

## 🎯 Use Case

When a user opens the app — especially at night — they often don't know exactly which medicine they need. They describe symptoms ("sore throat and fever") or ask about a specific medicine ("I need ibuprofen"). A naive chatbot is dangerous in this context: it can hallucinate dosages, invent pharmacy names, miss drug interactions, and recommend prescription-only medicines.

**Pharmagent solves this with four specialized agents that collaborate:**

1. A **Triage Agent** classifies the request and detects emergencies
2. A **Medical Knowledge Agent** retrieves real information from indexed medical leaflets via RAG
3. A **Pharmacy Agent** finds nearby pharmacies that have the medicine in stock and are currently open (including night-shift rotations)
4. A **Validator Agent** runs a safety check and blocks unsafe recommendations before they reach the user

---

## 🏗️ Architecture
┌──────────────────────────────┐
            │   HTML/CSS/JS Frontend       │
            │   (Streaming SSE chat UI)    │
            └──────────────┬───────────────┘
                           │ HTTP
            ┌──────────────▼───────────────┐
            │   FastAPI Backend            │
            └──────────────┬───────────────┘
                           │
            ┌──────────────▼───────────────┐
            │   LangGraph Orchestrator     │
            │   (Conditional workflow)     │
            └──────────────┬───────────────┘
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
   │   Triage     │ │   Medical    │ │   Pharmacy   │
   │   Agent      │ │   Knowledge  │ │   Agent      │
   └──────────────┘ └──────┬───────┘ └──────┬───────┘
                           │                │
                           ▼                ▼
                   ┌─────────────┐  ┌─────────────┐
                   │  LlamaIndex │  │   Mock      │
                   │  + Chroma   │  │   pharmacy  │
                   │  (RAG)      │  │   database  │
                   └─────────────┘  └─────────────┘
                           │
                           ▼
                   ┌─────────────┐
                   │  Validator  │
                   │  Agent      │
                   └─────────────┘
                           │
                           ▼
                      Final response

---

## 🛠️ Tech Stack

| Layer | Technology | Why |
|-------|------------|-----|
| LLM | Ollama + qwen2.5:7b | Local, free, strong instruction following |
| Embeddings | Ollama + nomic-embed-text | Fast, local, no API cost |
| RAG | LlamaIndex | Mature retrieval framework |
| Vector DB | ChromaDB | Persistent, zero infrastructure |
| Agents | LangChain | Industry standard for tool-using agents |
| Orchestration | LangGraph | Built for conditional multi-agent flows |
| Backend | FastAPI | Async, fast, auto-generates docs |
| Frontend | Vanilla HTML/CSS/JS | No build step, easy to demo |

See `CHOICES.md` for detailed justification of every technical decision.

---

## 📦 RAG Corpus

The system indexes the following private data:

- **10 medicine leaflets** (PDFs from DailyMed): acetaminophen, ibuprofen, amoxicillin, aspirin, omeprazole, loratadine, salbutamol, metformin, lisinopril, atorvastatin
- **Symptom-to-treatment guide** (15+ common symptoms with OTC recommendations)
- **Pharmacist safety guidelines** (dosage limits, prescription rules, dangerous combinations)
- **Drug interactions table** (15 known interaction pairs with severity)

**Chunking strategy**: medicine leaflets are chunked by section (Indications, Dosage, Contraindications, Side Effects). Each chunk carries metadata (`medicine_name`, `source`, `type`) so retrieval can filter by source type when needed. Drug interactions are stored as one chunk per pair with `drug_a`, `drug_b`, and `severity` metadata.

**Total**: 27 source documents, 161 chunks stored in ChromaDB with `nomic-embed-text` embeddings.

---

## 🤖 The Four Agents

### 1. Triage Agent (`agents/triage_agent.py`)
- **Role**: classify user intent and detect emergencies
- **Tools**: none — pure structured reasoning with JSON output
- **Output**: `{intent, symptoms, medicines_mentioned, urgency}`
- **Critical behavior**: detects emergency signals (chest pain, breathing difficulty, suspected overdose) and routes them out of the medicine recommendation flow immediately

### 2. Medical Knowledge Agent (`agents/medical_agent.py`)
- **Role**: provide accurate medical information using RAG-retrieved context
- **Tools**: `search_medicine_info`, `search_symptom_treatment`, `search_drug_interactions`
- **Behavior**: retrieves 3 relevant chunks per query, then synthesizes a structured response with citations
- **Output**: recommended medicines, dosage info, warnings, citations from source documents

### 3. Pharmacy Agent (`agents/pharmacy_agent.py`)
- **Role**: find which open pharmacies have the recommended medicines in stock
- **Tools**: `find_pharmacies_with_stock`, `check_pharmacy_open_now`, `get_night_shift_pharmacies`, `get_pharmacy_distance`
- **Behavior**: filters pharmacies by stock + open status + distance using the Haversine formula
- **Output**: ranked list of pharmacies with prices, distances, and night-shift flags

### 4. Validator Agent (`agents/validator_agent.py`)
- **Role**: safety check before showing the recommendation to the user
- **Tools**: `check_prescription_requirements`, `check_dangerous_combinations`, `check_emergency_signals`
- **Behavior**: blocks prescription medicines without a prescription, blocks known dangerous combinations, blocks any response when emergency keywords are detected
- **Output**: APPROVED or REJECTED with reason

---

## 🔄 Orchestration Flow

The graph is conditional, not pure sequential:
START → Triage
├─ EMERGENCY     → Emergency response → END
├─ SYMPTOM_QUERY → Medical → Pharmacy → Validator
├─ MEDICINE_QUERY → Medical → Pharmacy → Validator
└─ GENERAL_INFO  → Medical → Pharmacy → Validator
Validator
├─ APPROVED → END
├─ REJECTED (fixable, first try) → loop back to Medical
└─ REJECTED (final) → END with rejection reason
Shared state flows through every node and accumulates a `trace` array recording which agents fired and what they decided.

---

## 🚀 Installation & Running

### Prerequisites

- Python 3.11+
- Ollama installed
- Ollama models pulled:
ollama pull qwen2.5:7b
ollama pull nomic-embed-text
### Setup

```bash
# Clone the repo
git clone <your-repo-url>
cd pharma-assist

# Create virtual environment
python -m venv .venv
.venv\Scripts\activate     # Windows
source .venv/bin/activate  # Mac/Linux

# Install dependencies
pip install -r requirements.txt

# Configure environment
copy .env.example .env     # Windows
cp .env.example .env       # Mac/Linux

# Build the RAG index (one-time)
python rag/ingestion.py
```

### Run

```bash
# Start the server
uvicorn api.main:app --reload

# Open the frontend
# Visit http://127.0.0.1:8000/app in your browser
```

---

## 🎬 Demo Scenarios

The system handles four core scenarios:

| Scenario | Example Query | Expected Outcome |
|----------|---------------|------------------|
| Symptom query | "I have a sore throat and fever" | OTC recommendation + nearest pharmacy |
| OTC medicine | "I need ibuprofen 400mg" | Direct pharmacy lookup |
| Prescription medicine | "I need amoxicillin" (no prescription) | REJECTED with reason |
| Emergency | "I have chest pain and can't breathe" | Immediate emergency response, no recommendation |

---

## 🆚 RAG vs No-RAG Comparison

To demonstrate the value of grounding the LLM in real data, see `tests/rag_comparison.py`. Sample output:

**Raw qwen2.5 (no RAG):**
> "Visit Medway Pharmacy at 10 Rue des Érables... Take 12 tablets in 24 hours..."

These pharmacies **don't exist** and 12 tablets of ibuprofen is **above the safe daily limit**.

**Pharmagent:**
> "The closest pharmacy with ibuprofen is Pharmacie Centrale Casablanca, 3km away..."
> Cited sources: ibuprofen leaflet
> Validation status: APPROVED

Pharmagent returns real data from the indexed database and validates dosage safety before responding.

Run it yourself:
```bash
python -m tests.rag_comparison
```

---

## 📂 Project Structure
pharma-assist/
├── README.md                    # this file
├── CHOICES.md                   # technical decisions justified
├── requirements.txt             # Python dependencies
├── .env.example                 # config template
├── data/                        # private data corpus
│   ├── leaflets/                # 10 medicine PDFs
│   ├── symptom_guide.txt
│   ├── pharmacist_guidelines.txt
│   ├── interactions.csv
│   ├── pharmacies.json
│   ├── stock.json
│   └── night_shift_schedule.json
├── rag/                         # LlamaIndex RAG pipeline
│   ├── ingestion.py
│   ├── retrievers.py
│   └── chroma_db/               # generated, gitignored
├── agents/                      # the four agents
│   ├── triage_agent.py
│   ├── medical_agent.py
│   ├── pharmacy_agent.py
│   ├── validator_agent.py
│   └── prompts/
├── tools/                       # tool functions used by agents
│   ├── medical_tools.py
│   ├── pharmacy_tools.py
│   └── safety_tools.py
├── orchestration/               # LangGraph workflow
│   ├── graph.py
│   └── state.py
├── api/                         # FastAPI backend
│   └── main.py
├── frontend/                    # HTML/CSS/JS chat UI
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   ├── pipeline.js
│   ├── pharmacy-cards.js
│   ├── markdown.js
│   └── logo.png
└── tests/
└── rag_comparison.py        # the demo comparison

---

## ⚠️ Disclaimer

This is an **academic prototype**. It is not a substitute for professional medical advice. The system is framed as an *information assistant*, not a medical advisor. Real deployment would require certified medical review, regulatory compliance, and proper liability handling.

---

## 👥 Authors

Built as part of the Distributed AI & Multi-Agent Systems module, 2025–2026.


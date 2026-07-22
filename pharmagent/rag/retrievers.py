import os
from pathlib import Path
from dotenv import load_dotenv

from llama_index.core import VectorStoreIndex, Settings
from llama_index.embeddings.ollama import OllamaEmbedding
from llama_index.llms.ollama import Ollama
from llama_index.vector_stores.chroma import ChromaVectorStore
import chromadb

load_dotenv()

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
EMBED_MODEL = os.getenv("EMBED_MODEL", "nomic-embed-text")
LLM_MODEL = os.getenv("LLM_MODEL", "qwen2.5:7b")
CHROMA_DIR = Path("rag/chroma_db")


def setup_settings():
    Settings.llm = Ollama(
        model=LLM_MODEL,
        base_url=OLLAMA_BASE_URL,
        request_timeout=120.0
    )
    Settings.embed_model = OllamaEmbedding(
        model_name=EMBED_MODEL,
        base_url=OLLAMA_BASE_URL
    )


def get_index():
    """Load the existing ChromaDB index."""
    setup_settings()
    chroma_client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    collection = chroma_client.get_or_create_collection("medicine_leaflets")
    vector_store = ChromaVectorStore(chroma_collection=collection)
    index = VectorStoreIndex.from_vector_store(vector_store)
    return index


def search_medicine_info(query: str, top_k: int = 3) -> list[dict]:
    """
    General medicine information retriever.
    Returns top_k relevant chunks with their source metadata.
    """
    index = get_index()
    retriever = index.as_retriever(similarity_top_k=top_k)
    nodes = retriever.retrieve(query)

    results = []
    for node in nodes:
        results.append({
            "text": node.text,
            "medicine": node.metadata.get("medicine_name", "unknown"),
            "source": node.metadata.get("source", "unknown"),
            "score": round(node.score, 4) if node.score else None
        })
    return results


def search_symptom_treatment(query: str, top_k: int = 3) -> list[dict]:
    """
    Symptom to treatment retriever.
    Focuses the query on uses and indications sections.
    """
    focused_query = f"treatment uses indications for {query}"
    return search_medicine_info(focused_query, top_k)


def search_drug_interactions(medicine_name: str, top_k: int = 3) -> list[dict]:
    """
    Drug interaction retriever.
    Searches for interaction and warning information for a specific medicine.
    """
    focused_query = f"drug interactions warnings avoid {medicine_name}"
    return search_medicine_info(focused_query, top_k)


def format_results_for_agent(results: list[dict]) -> str:
    """
    Format retrieval results into a clean string for agent consumption.
    Includes citations so the agent can reference sources.
    """
    if not results:
        return "No relevant information found in the medical database."

    formatted = []
    for i, r in enumerate(results, 1):
        formatted.append(
            f"[Source {i}: {r['medicine']} leaflet]\n{r['text']}"
        )
    return "\n\n---\n\n".join(formatted)


if __name__ == "__main__":
    # Manual test with 5 queries
    test_queries = [
        ("medicine_info", "maximum daily dose of ibuprofen"),
        ("medicine_info", "can I take aspirin with ibuprofen"),
        ("symptom", "fever and headache treatment"),
        ("symptom", "allergic reaction symptoms"),
        ("interaction", "ibuprofen"),
    ]

    print("=" * 60)
    print("RETRIEVER MANUAL TEST")
    print("=" * 60)

    for query_type, query in test_queries:
        print(f"\nQuery type : {query_type}")
        print(f"Query      : {query}")
        print("-" * 40)

        if query_type == "medicine_info":
            results = search_medicine_info(query)
        elif query_type == "symptom":
            results = search_symptom_treatment(query)
        elif query_type == "interaction":
            results = search_drug_interactions(query)

        for r in results:
            print(f"Source : {r['medicine']} (score: {r['score']})")
            print(f"Text   : {r['text'][:200]}...")
            print()

        print("=" * 60)
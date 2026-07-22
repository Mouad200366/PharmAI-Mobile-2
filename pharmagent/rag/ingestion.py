import os
from pathlib import Path
from dotenv import load_dotenv

from llama_index.core import VectorStoreIndex, StorageContext, Settings, Document
from llama_index.embeddings.ollama import OllamaEmbedding
from llama_index.llms.ollama import Ollama
from llama_index.vector_stores.chroma import ChromaVectorStore
import chromadb
from pypdf import PdfReader

load_dotenv()

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
EMBED_MODEL = os.getenv("EMBED_MODEL", "nomic-embed-text")
LLM_MODEL = os.getenv("LLM_MODEL", "qwen2.5:7b")

LEAFLETS_DIR = Path("data/leaflets")
CHROMA_DIR = Path("rag/chroma_db")


def setup_settings():
    """Configure LlamaIndex to use Ollama for both LLM and embeddings."""
    Settings.llm = Ollama(
        model=LLM_MODEL,
        base_url=OLLAMA_BASE_URL,
        request_timeout=120.0
    )
    Settings.embed_model = OllamaEmbedding(
        model_name=EMBED_MODEL,
        base_url=OLLAMA_BASE_URL
    )


def extract_text_from_pdf(pdf_path: Path) -> str:
    """Extract clean text from a PDF using pypdf."""
    reader = PdfReader(str(pdf_path))
    text = ""
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            text += page_text + "\n"
    return text.strip()


def get_chroma_collection(collection_name: str):
    """Create or connect to a ChromaDB collection."""
    CHROMA_DIR.mkdir(parents=True, exist_ok=True)
    chroma_client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    collection = chroma_client.get_or_create_collection(collection_name)
    return chroma_client, collection


def ingest_all_documents():
    """
    Ingest all documents: PDF leaflets + text guides + CSV interactions.
    """
    setup_settings()
    chroma_client, collection = get_chroma_collection("medicine_leaflets")
    vector_store = ChromaVectorStore(chroma_collection=collection)
    storage_context = StorageContext.from_defaults(vector_store=vector_store)

    documents = []

    # 1. PDF leaflets
    pdf_files = list(LEAFLETS_DIR.glob("*.pdf"))
    print(f"\nFound {len(pdf_files)} PDF leaflets")
    for pdf_path in pdf_files:
        print(f"  Extracting: {pdf_path.name}")
        text = extract_text_from_pdf(pdf_path)
        if not text:
            print(f"  WARNING: No text extracted from {pdf_path.name} - skipping")
            continue
        documents.append(Document(
            text=text,
            metadata={
                "medicine_name": pdf_path.stem,
                "source": pdf_path.name,
                "type": "medicine_leaflet"
            }
        ))

    # 2. Text guides
    text_files = [
        Path("data/symptom_guide.txt"),
        Path("data/pharmacist_guidelines.txt")
    ]
    print(f"\nFound {len(text_files)} text guides")
    for txt_path in text_files:
        if txt_path.exists():
            print(f"  Loading: {txt_path.name}")
            text = txt_path.read_text(encoding="utf-8")
            documents.append(Document(
                text=text,
                metadata={
                    "source": txt_path.name,
                    "type": "guidelines"
                }
            ))

    # 3. Interactions CSV
    interactions_path = Path("data/interactions.csv")
    if interactions_path.exists():
        print(f"\nLoading interactions CSV")
        import pandas as pd
        df = pd.read_csv(interactions_path)
        for _, row in df.iterrows():
            text = (
                f"Drug interaction between {row['drug_a']} and {row['drug_b']}: "
                f"Severity: {row['severity']}. {row['description']}"
            )
            documents.append(Document(
                text=text,
                metadata={
                    "drug_a": row["drug_a"],
                    "drug_b": row["drug_b"],
                    "severity": row["severity"],
                    "type": "drug_interaction",
                    "source": "interactions.csv"
                }
            ))
        print(f"  Loaded {len(df)} interaction records")

    print(f"\nTotal documents to index: {len(documents)}")
    print("\nBuilding index and storing in ChromaDB...")

    index = VectorStoreIndex.from_documents(
        documents,
        storage_context=storage_context,
        show_progress=True
    )

    print(f"\nDone. Collection now has {collection.count()} chunks stored.")
    return index


if __name__ == "__main__":
    print("=== Ingesting all documents ===")
    ingest_all_documents()
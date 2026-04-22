#!/usr/bin/env python3
"""vault_llamaindex.py — LlamaIndex over ~/Obsidian/claude-vault/ using local embeddings + IonRouter LLM.

Usage:
  python scripts/vault_llamaindex.py build
  python scripts/vault_llamaindex.py query "what is spec-lesson"

LLM: IonRouter (OpenAI-compatible, Qwen 3.5 122B) — reads IONROUTER_KEY from .env
Embeddings: BAAI/bge-small-en-v1.5 via HuggingFace (local, no API calls)
"""

import argparse
import os
import sys
from pathlib import Path
from typing import Any, Optional, Sequence

import httpx

from llama_index.core import (
    SimpleDirectoryReader,
    StorageContext,
    VectorStoreIndex,
    Settings,
    load_index_from_storage,
)
from llama_index.core.llms import (
    CustomLLM,
    CompletionResponse,
    CompletionResponseGen,
    LLMMetadata,
)
from llama_index.core.llms.callbacks import llm_completion_callback
from llama_index.embeddings.huggingface import HuggingFaceEmbedding

VAULT = Path.home() / "Obsidian" / "claude-vault"
INDEX_DIR = VAULT / ".llamaindex"
EXCLUDE_DIRS = {".obsidian", ".kuzu", ".llamaindex", ".trash"}

EMBED_MODEL_PRIMARY = "BAAI/bge-small-en-v1.5"
EMBED_MODEL_FALLBACK = "sentence-transformers/all-MiniLM-L6-v2"

IONROUTER_BASE_URL = "https://api.ionrouter.io/v1"
IONROUTER_MODEL = "qwen3.5-122b-a10b"

ENV_FILE = Path(__file__).parent.parent / ".env"


def _load_dotenv():
    """Load key=value pairs from project .env into os.environ (no-op if already set)."""
    if not ENV_FILE.exists():
        return
    with open(ENV_FILE) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = val


class IonRouterLLM(CustomLLM):
    """Thin LlamaIndex CustomLLM wrapper around IonRouter's OpenAI-compatible API."""

    api_key: str
    model: str = IONROUTER_MODEL
    base_url: str = IONROUTER_BASE_URL
    max_tokens: int = 1024
    context_window_size: int = 32768

    @property
    def metadata(self) -> LLMMetadata:
        return LLMMetadata(
            context_window=self.context_window_size,
            num_output=self.max_tokens,
            model_name=self.model,
        )

    def _call_api(self, prompt: str) -> str:
        payload = {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": self.max_tokens,
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        resp = httpx.post(
            f"{self.base_url}/chat/completions",
            json=payload,
            headers=headers,
            timeout=60,
        )
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]

    @llm_completion_callback()
    def complete(self, prompt: str, **kwargs: Any) -> CompletionResponse:
        text = self._call_api(prompt)
        return CompletionResponse(text=text)

    @llm_completion_callback()
    def stream_complete(self, prompt: str, **kwargs: Any) -> CompletionResponseGen:
        # Non-streaming fallback: yield the full response as one chunk
        text = self._call_api(prompt)
        yield CompletionResponse(text=text, delta=text)


def _configure_settings():
    _load_dotenv()

    ion_key = os.environ.get("IONROUTER_KEY") or os.environ.get("IONROUTER_API_KEY")
    if not ion_key:
        print(
            "ERROR: IONROUTER_KEY not found in environment or .env\n"
            "Add it to .env as:  IONROUTER_KEY=<your-key>",
            file=sys.stderr,
        )
        sys.exit(1)

    Settings.llm = IonRouterLLM(api_key=ion_key)

    # Try primary embed model, fall back if download fails
    for model_name in (EMBED_MODEL_PRIMARY, EMBED_MODEL_FALLBACK):
        try:
            Settings.embed_model = HuggingFaceEmbedding(model_name=model_name)
            print(f"Embedding model: {model_name}")
            break
        except Exception as e:
            print(f"Warning: could not load {model_name}: {e}", file=sys.stderr)
            if model_name == EMBED_MODEL_FALLBACK:
                print("ERROR: No embedding model available. Check your internet connection.", file=sys.stderr)
                sys.exit(1)
            print(f"Falling back to {EMBED_MODEL_FALLBACK} ...", file=sys.stderr)


def _load_docs():
    if not VAULT.exists():
        print(f"ERROR: Vault not found at {VAULT}", file=sys.stderr)
        sys.exit(1)

    exclude_globs = [f"**/{d}/**" for d in EXCLUDE_DIRS]
    reader = SimpleDirectoryReader(
        input_dir=str(VAULT),
        recursive=True,
        required_exts=[".md"],
        exclude=exclude_globs,
    )
    return reader.load_data()


def build_index():
    _configure_settings()

    print(f"Reading vault: {VAULT}")
    docs = _load_docs()
    print(f"Indexing {len(docs)} markdown files ...")

    index = VectorStoreIndex.from_documents(docs, show_progress=True)

    INDEX_DIR.mkdir(parents=True, exist_ok=True)
    index.storage_context.persist(persist_dir=str(INDEX_DIR))
    print(f"\nIndex persisted to {INDEX_DIR}")

    # Write .gitignore inside the vault (the vault isn't a git repo, but good practice)
    gitignore_path = VAULT / ".gitignore"
    if not gitignore_path.exists():
        gitignore_path.write_text(".llamaindex/\n.kuzu/\n")
        print(f"Created {gitignore_path}")

    _write_readme()
    print("Done. Run queries with:  python scripts/vault_llamaindex.py query \"<question>\"")


def query_index(question: str):
    if not INDEX_DIR.exists():
        print(
            "Index not built yet. Run:  python scripts/vault_llamaindex.py build",
            file=sys.stderr,
        )
        sys.exit(1)

    _configure_settings()

    storage_context = StorageContext.from_defaults(persist_dir=str(INDEX_DIR))
    index = load_index_from_storage(storage_context)
    engine = index.as_query_engine(similarity_top_k=5, response_mode="compact")

    print(f"Query: {question}\n")
    response = engine.query(question)
    print(response)

    print("\n--- Sources ---")
    for node in response.source_nodes:
        path = node.node.metadata.get("file_path", "?")
        # Shorten to vault-relative path for readability
        try:
            rel = Path(path).relative_to(VAULT)
        except ValueError:
            rel = path
        print(f"  - {rel}  (score={node.score:.3f})")


def _write_readme():
    readme = INDEX_DIR / "README.md"
    readme.write_text(
        """\
# LlamaIndex — Obsidian Vault Index

This directory contains a persisted LlamaIndex VectorStoreIndex built from the markdown notes in `~/Obsidian/claude-vault/`.

## How it was built

- **Documents**: all `.md` files in the vault, excluding `.obsidian/`, `.kuzu/`, `.llamaindex/`, `.trash/`
- **Embeddings**: `BAAI/bge-small-en-v1.5` via HuggingFace (local, no API cost, ~100 MB download cached to `~/.cache/huggingface/`)
- **LLM**: IonRouter `qwen3.5-122b-a10b` via OpenAI-compatible API (query synthesis only)
- **Storage**: LlamaIndex's default `SimpleVectorStore` + `SimpleDocumentStore` as JSON files here

## Rebuild the index

```bash
cd /Users/mei/ledger-creative-analyzer
source .venv/bin/activate
python scripts/vault_llamaindex.py build
```

Re-run any time you add or update vault notes. The build overwrites the existing index.

## Run a query

```bash
python scripts/vault_llamaindex.py query "what is spec-lesson"
python scripts/vault_llamaindex.py query "which projects use Butterbase"
python scripts/vault_llamaindex.py query "how does the IonRouter LLM get called"
```

Each query:
1. Embeds the question locally (no API call)
2. Retrieves the top-5 most similar chunks from the vector store
3. Sends those chunks + question to Claude Haiku for answer synthesis
4. Prints the answer and cites source files with similarity scores

## Tradeoffs vs `claude_notebook` (BM25 + Qwen rerank)

| | `vault_llamaindex` | `claude_notebook` |
|---|---|---|
| Search type | Dense vector (semantic) | BM25 keyword + Qwen rerank |
| Embedding | Local HF model (free, ~3 ms/query) | No embed — BM25 is term-matching |
| Reranking | None (cosine similarity only) | Qwen 3.5 reranker via IonRouter (~$0.001/query) |
| Query LLM | IonRouter Qwen 3.5 122B (synthesizes full answer) | Returns raw chunks, no synthesis |
| Best for | Natural-language questions, paraphrase recall | Exact terminology, code tokens, filenames |
| Misses | Rare/technical jargon not in vocab | Semantic paraphrases, cross-project concepts |
| Cold start | Slow first run (HF model download ~100 MB) | No download needed |
| Index rebuild | `python scripts/vault_llamaindex.py build` (~30–60 s) | `python scripts/claude_notebook.py index` |

**Rule of thumb**: use `vault_llamaindex` for broad "what do I know about X" questions; use `claude_notebook` for finding exact code patterns or specific filenames.

## Files in this directory

- `default__vector_store.json` — embedding vectors
- `docstore.json` — raw document chunks + metadata
- `index_store.json` — index metadata
- `graph_store.json` — (empty, not used)
- `README.md` — this file
"""
    )
    print(f"Wrote {readme}")


def main():
    parser = argparse.ArgumentParser(
        description="LlamaIndex query engine over ~/Obsidian/claude-vault/"
    )
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("build", help="Build or rebuild the vector index from the vault")
    q = sub.add_parser("query", help="Query the persisted index")
    q.add_argument("question", help="Natural-language question to answer")
    args = parser.parse_args()

    if args.cmd == "build":
        build_index()
    elif args.cmd == "query":
        query_index(args.question)


if __name__ == "__main__":
    main()

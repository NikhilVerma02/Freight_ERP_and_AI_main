"""
RAG quality evaluation for the SLA RAG pipeline (app/rag/sla_rag.py), using
Ragas (free, open-source) with the organisation's LLM gateway as both the
judge LLM and the embeddings provider (see API_ENDPOINT/API_KEY in the root
.env) — already configured for this project.

Run from erp-app/backend, using the ISOLATED eval venv (NOT the shared
project .venv — Ragas's LangChain integration needs an older
langchain-core/-community/-openai generation than other tools in this
repo already pulled into the shared venv; see requirements-eval.txt and the
one-time setup below):

    python -m venv .venv-eval
    .venv-eval/Scripts/python -m pip install -r requirements.txt -r requirements-eval.txt
    .venv-eval/Scripts/python -m pip install "langchain-community==0.3.27" \
        "langchain-openai==0.3.35"
    .venv-eval/Scripts/python scripts/eval_rag.py

For each (sla_id, sla_text) in scripts/rag_eval_dataset.json: indexes the
text fresh (self-contained — doesn't depend on whatever SLAs happen to be
in the live app data), then for each question against that SLA, calls the
real ask_sla() RAG pipeline (gateway embeddings + gateway chat answer) and
scores the result with four Ragas metrics:
  - faithfulness:       is the answer actually grounded in the retrieved chunks?
  - answer_relevancy:   does the answer actually address the question asked?
  - context_precision:  are the retrieved chunks relevant to the question?
  - context_recall:     did retrieval surface what was needed to answer fully?

Prints a scorecard and saves it to data/rag_eval_results/<timestamp>.json.
Also attaches each row's scores back to its Langfuse trace (if configured)
via observability.score_trace(), tying evaluation into the same tracing
system used for live runs — see app/observability.py.
"""
from __future__ import annotations

import json
import sys
import warnings
from datetime import datetime, timezone
from pathlib import Path

warnings.filterwarnings("ignore", category=DeprecationWarning)

# Use the OS certificate store (not certifi) for outbound HTTPS — see app/main.py.
import truststore  # noqa: E402

truststore.inject_into_ssl()

# Load root .env the same way app/main.py does.
from dotenv import load_dotenv  # noqa: E402

_ROOT_ENV = Path(__file__).parent.parent.parent.parent / ".env"
load_dotenv(_ROOT_ENV if _ROOT_ENV.exists() else None)

sys.path.insert(0, str(Path(__file__).parent.parent))  # so `import app...` works when run directly

from app import observability  # noqa: E402
from app.config import API_ENDPOINT, API_KEY, RAG_CHAT_MODEL, RAG_EMBEDDING_MODEL  # noqa: E402
from app.rag import sla_rag  # noqa: E402

DATASET_PATH = Path(__file__).parent / "rag_eval_dataset.json"
RESULTS_DIR = Path(__file__).parent.parent / "data" / "rag_eval_results"


def main() -> None:
    if not API_ENDPOINT or not API_KEY:
        print("ERROR: API_ENDPOINT and API_KEY must be set in .env to run this eval.")
        sys.exit(1)

    from ragas import EvaluationDataset, evaluate
    from ragas.embeddings import LangchainEmbeddingsWrapper
    from ragas.llms import LangchainLLMWrapper
    from ragas.metrics import AnswerRelevancy, ContextPrecision, ContextRecall, Faithfulness
    from langchain_openai import ChatOpenAI, OpenAIEmbeddings

    dataset_spec = json.loads(DATASET_PATH.read_text(encoding="utf-8"))

    print(f"Indexing {len(dataset_spec['slas'])} test SLA(s) into chromadb...")
    for sla in dataset_spec["slas"]:
        status = sla_rag.index_sla(sla["sla_id"], sla["vendor_username"], sla["text"])
        print(f"  {sla['sla_id']}: {status}")
        if not status["indexed"]:
            print(f"ERROR: failed to index {sla['sla_id']} — aborting.")
            sys.exit(1)

    print(f"\nAsking {len(dataset_spec['questions'])} question(s) against the real ask_sla() pipeline...")
    rows: list[dict] = []
    trace_ids: list[str | None] = []
    for i, q in enumerate(dataset_spec["questions"]):
        trace_id = observability.trace_id_for(f"rag_eval_{q['sla_id']}_{i}")
        result = sla_rag.ask_sla(q["sla_id"], q["question"], trace_id=trace_id)
        if result["error"]:
            print(f"  WARNING: question {i} failed: {result['error']}")
            continue
        rows.append(
            {
                "user_input": q["question"],
                "response": result["answer"] or "",
                "retrieved_contexts": result["sources"] or [],
                "reference": q["ground_truth"],
            }
        )
        trace_ids.append(trace_id)
        print(f"  [{q['sla_id']}] {q['question'][:60]}... -> {(result['answer'] or '')[:80]}...")

    if not rows:
        print("ERROR: no questions produced usable answers — nothing to evaluate.")
        sys.exit(1)

    eval_dataset = EvaluationDataset.from_list(rows)
    llm = LangchainLLMWrapper(ChatOpenAI(model=RAG_CHAT_MODEL, base_url=API_ENDPOINT, api_key=API_KEY, temperature=0))
    embeddings = LangchainEmbeddingsWrapper(OpenAIEmbeddings(model=RAG_EMBEDDING_MODEL, base_url=API_ENDPOINT, api_key=API_KEY))

    print("\nRunning Ragas evaluation (gateway judge + gateway embeddings)...")
    metrics = [Faithfulness(), AnswerRelevancy(), ContextPrecision(), ContextRecall()]
    eval_result = evaluate(dataset=eval_dataset, metrics=metrics, llm=llm, embeddings=embeddings)

    df = eval_result.to_pandas()
    metric_columns = ["faithfulness", "answer_relevancy", "context_precision", "context_recall"]
    available_columns = [c for c in metric_columns if c in df.columns]

    import math

    print("\n=== Scorecard (per-question) ===")
    for idx, row in df.iterrows():
        print(f"\n[{idx}] {row['user_input'][:70]}")
        for col in available_columns:
            value = row[col]
            is_valid = value is not None and not (isinstance(value, float) and math.isnan(value))
            print(f"  {col}: {value:.3f}" if is_valid else f"  {col}: FAILED (judge call errored — likely rate-limited; rerun later)")
            if is_valid:
                trace_id = trace_ids[idx] if idx < len(trace_ids) else None
                observability.score_trace(trace_id, col, float(value))

    print("\n=== Scorecard (averages) ===")
    averages = {}
    for col in available_columns:
        mean = float(df[col].mean())
        averages[col] = round(mean, 4) if not math.isnan(mean) else None
        print(f"  {col}: {averages[col]}")

    def sanitize(value):
        return None if isinstance(value, float) and math.isnan(value) else value

    rows_clean = [
        {k: sanitize(v) for k, v in r.items()}
        for r in df[["user_input", *available_columns]].to_dict(orient="records")
    ]

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    out_path = RESULTS_DIR / f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.json"
    out_path.write_text(
        json.dumps({"averages": averages, "rows": rows_clean}, indent=2, default=str),
        encoding="utf-8",
    )
    print(f"\nSaved full scorecard to {out_path}")

    # Test SLAs are indexed into the SAME chromadb vector_cache the live app uses (just under
    # clearly-synthetic ids) — clean them up so this script doesn't leave clutter behind.
    for sla in dataset_spec["slas"]:
        sla_rag.delete_sla_index(sla["sla_id"])
    print(f"Cleaned up {len(dataset_spec['slas'])} test SLA index(es).")

    observability.flush()


if __name__ == "__main__":
    main()

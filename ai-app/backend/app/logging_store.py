"""
JSON-file-backed append-only logging for agent pipeline runs.

Mirrors the ERP's atomic-write pattern (write to temp file in the same
directory, then os.replace) guarded by a per-path threading.Lock, so
concurrent requests in this process don't corrupt the files.

- data/agent_logs.json   : flat list of per-step log entries (one per agent
                            invocation within a run).
- data/agent_runs.json   : one record per full pipeline run.
"""
from __future__ import annotations

import json
import os
import tempfile
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).parent.parent / "data"
LOGS_PATH = DATA_DIR / "agent_logs.json"
RUNS_PATH = DATA_DIR / "agent_runs.json"

_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()


def _lock_for(path: Path) -> threading.Lock:
    key = str(path.resolve())
    with _locks_guard:
        if key not in _locks:
            _locks[key] = threading.Lock()
        return _locks[key]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def reset_on_startup() -> None:
    """Wipe agent_logs.json/agent_runs.json on every backend startup. This is intentionally
    ephemeral, demo-oriented state: each run's full step-by-step output is still written to
    these files while the server is up (so Logs & Exceptions / Case Detail can show it), but
    nothing persists across restarts — keeps the case history from accumulating test runs."""
    _write_list(LOGS_PATH, [])
    _write_list(RUNS_PATH, [])


def new_run_id() -> str:
    return f"run_{uuid.uuid4().hex[:12]}"


def _read_list(path: Path) -> list[dict]:
    lock = _lock_for(path)
    with lock:
        if not path.exists():
            return []
        with open(path, "r", encoding="utf-8") as f:
            content = f.read().strip()
            if not content:
                return []
            data = json.loads(content)
            return data if isinstance(data, list) else []


def _write_list(path: Path, data: list[dict]) -> None:
    lock = _lock_for(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with lock:
        fd, tmp_path = tempfile.mkstemp(dir=str(path.parent), prefix=f".{path.name}.", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, default=str)
            os.replace(tmp_path, path)
        finally:
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass


def _append(path: Path, record: dict) -> dict:
    records = _read_list(path)
    records.append(record)
    _write_list(path, records)
    return record


# ---------------------------------------------------------------------------
# agent_logs.json
# ---------------------------------------------------------------------------

def log_step(
    run_id: str,
    agent: str,
    input_summary: Any,
    output_summary: Any,
    status: str,
    latency_ms: float | None = None,
    model: str | None = None,
    tokens: dict | None = None,
    error: str | None = None,
) -> dict:
    """Append one structured step entry to agent_logs.json. status: 'ok' | 'failed'."""
    entry = {
        "run_id": run_id,
        "agent": agent,
        "timestamp": now_iso(),
        "input_summary": input_summary,
        "output_summary": output_summary,
        "status": status,
        "latency_ms": latency_ms,
        "model": model,
        "tokens": tokens,
        "error": error,
    }
    return _append(LOGS_PATH, entry)


def list_logs(status: str | None = None, run_id: str | None = None) -> list[dict]:
    logs = _read_list(LOGS_PATH)
    if status:
        logs = [l for l in logs if l.get("status") == status]
    if run_id:
        logs = [l for l in logs if l.get("run_id") == run_id]
    return logs


# ---------------------------------------------------------------------------
# agent_runs.json
# ---------------------------------------------------------------------------

def create_run(run_id: str, case_summary: str, actor_username: str | None = None, actor_role: str | None = None) -> dict:
    record = {
        "run_id": run_id,
        "started_at": now_iso(),
        "finished_at": None,
        "status": "running",
        "case_summary": case_summary,
        "claim_id": None,
        "alert_id": None,
        "actor_username": actor_username,
        "actor_role": actor_role,
    }
    return _append(RUNS_PATH, record)


def finish_run(run_id: str, status: str, claim_id: int | None = None, alert_id: int | None = None) -> dict | None:
    runs = _read_list(RUNS_PATH)
    for i, r in enumerate(runs):
        if r.get("run_id") == run_id:
            r["finished_at"] = now_iso()
            r["status"] = status
            if claim_id is not None:
                r["claim_id"] = claim_id
            if alert_id is not None:
                r["alert_id"] = alert_id
            runs[i] = r
            _write_list(RUNS_PATH, runs)
            return r
    return None


def list_runs(actor_username: str | None = None) -> list[dict]:
    runs = _read_list(RUNS_PATH)
    if actor_username is not None:
        runs = [r for r in runs if r.get("actor_username") == actor_username]
    return sorted(runs, key=lambda r: r.get("started_at", ""), reverse=True)


def get_run(run_id: str) -> dict | None:
    for r in _read_list(RUNS_PATH):
        if r.get("run_id") == run_id:
            return r
    return None


# ---------------------------------------------------------------------------
# KPI aggregations
# ---------------------------------------------------------------------------

def kpi_summary() -> dict:
    logs = _read_list(LOGS_PATH)
    runs = _read_list(RUNS_PATH)

    per_agent: dict[str, dict] = {}
    for entry in logs:
        agent = entry.get("agent", "unknown")
        bucket = per_agent.setdefault(agent, {"count": 0, "success": 0, "failed": 0, "total_latency_ms": 0.0, "total_tokens": 0})
        bucket["count"] += 1
        if entry.get("status") == "ok":
            bucket["success"] += 1
        else:
            bucket["failed"] += 1
        latency = entry.get("latency_ms") or 0
        bucket["total_latency_ms"] += latency
        tokens = entry.get("tokens") or {}
        bucket["total_tokens"] += (tokens.get("prompt_tokens") or 0) + (tokens.get("completion_tokens") or 0)

    per_agent_summary = {}
    for agent, bucket in per_agent.items():
        count = bucket["count"] or 1
        per_agent_summary[agent] = {
            "total_calls": bucket["count"],
            "success_count": bucket["success"],
            "failed_count": bucket["failed"],
            "success_rate": round(bucket["success"] / count, 4),
            "avg_latency_ms": round(bucket["total_latency_ms"] / count, 2),
            "total_token_estimate": bucket["total_tokens"],
        }

    total_runs = len(runs)
    successful_runs = len([r for r in runs if r.get("status") == "completed"])
    failed_runs = len([r for r in runs if r.get("status") == "failed"])

    return {
        "total_runs": total_runs,
        "successful_runs": successful_runs,
        "failed_runs": failed_runs,
        "run_success_rate": round(successful_runs / total_runs, 4) if total_runs else None,
        "per_agent": per_agent_summary,
        "total_log_entries": len(logs),
    }

"""
Lightweight local API-call observability — logs method/path/status/duration
for every HTTP request to a capped local JSON file. Deliberately NOT sent
to Langfuse: that free tier is reserved for LLM call traces specifically
(see app/observability.py); plain CRUD/auth traffic would burn through the
event budget fast for little insight.
"""
from __future__ import annotations

import json
import os
import tempfile
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

DATA_DIR = Path(__file__).parent.parent / "data"
LOG_PATH = DATA_DIR / "api_logs.json"
MAX_ENTRIES = 500

_lock = threading.Lock()


def _read() -> list[dict]:
    if not LOG_PATH.exists():
        return []
    with open(LOG_PATH, "r", encoding="utf-8") as f:
        content = f.read().strip()
        return json.loads(content) if content else []


def _write(entries: list[dict]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(dir=str(DATA_DIR), prefix=".api_logs.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(entries, f, indent=2, default=str)
        os.replace(tmp_path, LOG_PATH)
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass


def _append(entry: dict) -> None:
    with _lock:
        entries = _read()
        entries.append(entry)
        if len(entries) > MAX_ENTRIES:
            entries = entries[-MAX_ENTRIES:]
        _write(entries)


def list_api_logs(limit: int = 100) -> list[dict]:
    """Most recent first."""
    entries = _read()
    return entries[-limit:][::-1]


class ApiLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            return response
        finally:
            duration_ms = (time.perf_counter() - start) * 1000
            try:
                _append(
                    {
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "method": request.method,
                        "path": request.url.path,
                        "status_code": status_code,
                        "duration_ms": round(duration_ms, 2),
                    }
                )
            except Exception:
                pass  # never let logging break a request

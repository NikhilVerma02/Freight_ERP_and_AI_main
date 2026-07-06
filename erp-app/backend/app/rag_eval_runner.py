"""Spawns scripts/eval_rag.py as a background subprocess (in its isolated
.venv-eval — see that script's docstring for why it needs a separate
interpreter) so the RAG Evaluation page can trigger a re-run without
blocking the request. One run at a time; in-memory state only (lost on
backend restart, which just means the button is re-clickable, no harm)."""
from __future__ import annotations

import subprocess
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
EVAL_PYTHON = BACKEND_DIR / ".venv-eval" / "Scripts" / "python.exe"
EVAL_SCRIPT = BACKEND_DIR / "scripts" / "eval_rag.py"
LOG_PATH = BACKEND_DIR / "data" / "rag_eval_results" / "_last_run.log"

_process: subprocess.Popen | None = None


def is_running() -> bool:
    return _process is not None and _process.poll() is None


def start_run() -> tuple[bool, str | None]:
    global _process
    if is_running():
        return False, "An evaluation run is already in progress."
    if not EVAL_PYTHON.exists():
        return False, (
            "Eval environment not set up — see the docstring in scripts/eval_rag.py "
            "for the one-time .venv-eval setup steps."
        )
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG_PATH, "w", encoding="utf-8") as log_file:
        _process = subprocess.Popen(
            [str(EVAL_PYTHON), str(EVAL_SCRIPT)],
            cwd=str(BACKEND_DIR),
            stdout=log_file,
            stderr=subprocess.STDOUT,
        )
    return True, None


def get_status() -> dict:
    running = is_running()
    exit_code = None if running or _process is None else _process.returncode
    log_tail = ""
    if LOG_PATH.exists():
        try:
            log_tail = LOG_PATH.read_text(encoding="utf-8", errors="replace")[-2000:]
        except OSError:
            pass
    return {"running": running, "exit_code": exit_code, "log_tail": log_tail}

"""
Generic JSON file store helpers.

Single source of truth for reading/writing JSON "collections" used by every
router/service in the ERP backend. Provides atomic writes (write to temp file
then os.replace) guarded by a per-file-path threading.Lock to avoid races
between concurrent requests in the same process.
"""
from __future__ import annotations

import json
import os
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).parent.parent / "data"

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


def read_json(path: Path) -> Any:
    lock = _lock_for(path)
    with lock:
        if not path.exists():
            return None
        with open(path, "r", encoding="utf-8") as f:
            content = f.read().strip()
            if not content:
                return None
            return json.loads(content)


def write_json(path: Path, data: Any) -> None:
    lock = _lock_for(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with lock:
        fd, tmp_path = tempfile.mkstemp(
            dir=str(path.parent), prefix=f".{path.name}.", suffix=".tmp"
        )
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


class Collection:
    """Wraps a JSON file holding a list[dict] of records with CRUD helpers."""

    def __init__(self, filename: str):
        self.path = DATA_DIR / filename

    def _load(self) -> list[dict]:
        data = read_json(self.path)
        if data is None:
            return []
        if not isinstance(data, list):
            raise ValueError(f"{self.path} does not contain a JSON list")
        return data

    def _save(self, records: list[dict]) -> None:
        write_json(self.path, records)

    def list_all(self) -> list[dict]:
        return self._load()

    def get(self, record_id: int) -> dict | None:
        for rec in self._load():
            if rec.get("id") == record_id:
                return rec
        return None

    def create(self, record: dict) -> dict:
        records = self._load()
        next_id = (max((r.get("id", 0) for r in records), default=0)) + 1
        ts = now_iso()
        new_record = {
            "id": next_id,
            **record,
            "created_at": ts,
            "updated_at": ts,
        }
        records.append(new_record)
        self._save(records)
        return new_record

    def update(self, record_id: int, patch: dict) -> dict | None:
        records = self._load()
        for i, rec in enumerate(records):
            if rec.get("id") == record_id:
                updated = {**rec, **patch, "id": record_id, "updated_at": now_iso()}
                records[i] = updated
                self._save(records)
                return updated
        return None

    def delete(self, record_id: int) -> bool:
        records = self._load()
        new_records = [r for r in records if r.get("id") != record_id]
        if len(new_records) == len(records):
            return False
        self._save(new_records)
        return True

    def append_raw(self, record: dict) -> dict:
        """Append a record as-is (auto id + timestamp) without merge semantics.
        Used for append-only collections like audit_logs."""
        records = self._load()
        next_id = (max((r.get("id", 0) for r in records), default=0)) + 1
        new_record = {"id": next_id, **record}
        records.append(new_record)
        self._save(records)
        return new_record


class CollectionByKey:
    """Wraps a JSON file holding a list[dict] of records keyed by a unique
    field (e.g. "username") instead of an auto-increment int id. Same
    atomic-write/lock pattern as Collection (delegates to read_json/write_json)."""

    def __init__(self, filename: str, key_field: str = "username"):
        self.path = DATA_DIR / filename
        self.key_field = key_field

    def _load(self) -> list[dict]:
        data = read_json(self.path)
        if data is None:
            return []
        if not isinstance(data, list):
            raise ValueError(f"{self.path} does not contain a JSON list")
        return data

    def _save(self, records: list[dict]) -> None:
        write_json(self.path, records)

    def list_all(self) -> list[dict]:
        return self._load()

    def get_by_key(self, key: str) -> dict | None:
        for rec in self._load():
            if rec.get(self.key_field) == key:
                return rec
        return None

    def create(self, record: dict) -> dict:
        records = self._load()
        key = record.get(self.key_field)
        if key is None:
            raise ValueError(f"record missing key field '{self.key_field}'")
        if any(r.get(self.key_field) == key for r in records):
            raise ValueError(f"duplicate key '{key}' for field '{self.key_field}'")
        ts = now_iso()
        new_record = {**record, "created_at": ts, "updated_at": ts}
        records.append(new_record)
        self._save(records)
        return new_record

    def update_by_key(self, key: str, patch: dict) -> dict | None:
        records = self._load()
        for i, rec in enumerate(records):
            if rec.get(self.key_field) == key:
                updated = {**rec, **patch, self.key_field: key, "updated_at": now_iso()}
                records[i] = updated
                self._save(records)
                return updated
        return None

    def delete_by_key(self, key: str) -> bool:
        records = self._load()
        new_records = [r for r in records if r.get(self.key_field) != key]
        if len(new_records) == len(records):
            return False
        self._save(new_records)
        return True

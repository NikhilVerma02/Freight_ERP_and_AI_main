"""Shared helper for the per-agent confidence scores (0-100) — see each
agent's module docstring for how its own score is derived. Centralized here
so every agent clamps/defaults an LLM-reported value the same defensive way
(an LLM omitting the field or returning a non-numeric value never breaks
the pipeline, it just falls back to a neutral default)."""
from __future__ import annotations

DEFAULT_CONFIDENCE = 50


def clamp_confidence(value: object, default: int = DEFAULT_CONFIDENCE) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return default
    return max(0, min(100, round(value)))


def average_confidence(values: list[object]) -> int | None:
    numeric = [v for v in values if isinstance(v, (int, float)) and not isinstance(v, bool)]
    if not numeric:
        return None
    return round(sum(numeric) / len(numeric))

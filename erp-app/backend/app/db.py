"""Compatibility shim — Supabase removed. now_iso() kept for any residual imports."""
from app.store import now_iso  # re-export

__all__ = ["now_iso"]

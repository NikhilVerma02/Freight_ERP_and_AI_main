"""
Shared config for the claims pipeline agents (Inspector/Context/Policy/
Inventory/Reorder/Claim/Governance). Model selection itself lives in
app/config/models.py (the gateway role table) — this module only holds the
observability settings, sourced from the environment (root .env).
"""
from __future__ import annotations

import os

# Observability — Langfuse Cloud free tier. Blank keys = tracing fully disabled
# (see app/observability.py — every call site no-ops gracefully).
LANGFUSE_PUBLIC_KEY = os.environ.get("LANGFUSE_PUBLIC_KEY", "")
LANGFUSE_SECRET_KEY = os.environ.get("LANGFUSE_SECRET_KEY", "")
LANGFUSE_HOST = os.environ.get("LANGFUSE_HOST", "https://cloud.langfuse.com")

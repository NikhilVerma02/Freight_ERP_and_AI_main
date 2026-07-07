"""
Role-scoped portal chatbot: answers questions about the logged-in user's OWN
orders, claims, inventory, and SLA terms. Every question re-fetches that
user's data fresh from the existing service layer (no caching — datasets are
small/demo-sized) and is grounded in it via the organisation's LLM gateway,
the same model already used for SLA Q&A (see app/rag/llm.py).

Multilingual: no translation step needed. The language of each question is
detected server-side (see _detect_language, by Unicode script) and stated
explicitly to the model as a per-call instruction — relying on the model to
infer "reply in the question's language" purely from a system-prompt hint
is unreliable once the conversation history contains a different language
(smaller/faster models tend to drift toward whatever language dominates the
context window). Naming the language explicitly, freshly, on every call
fixes that.

Memory: conversations are organized into separate sessions per user (see
app/services/chat_history.py — "New chat" + a "Recents" list, like this very
assistant). Each question/answer is persisted into its session, and the most
recent turns from THAT session are replayed back into the LLM as conversation
history on every new question — switching sessions starts a genuinely fresh
context. History is capped to a configured number of days
(CHATBOT_HISTORY_RETENTION_DAYS) and turns per session (CHATBOT_HISTORY_MAX_TURNS).
"""
from __future__ import annotations

import json
import logging
import re

from app.rag import vector_store
from app.rag.embeddings import embed_query
from app.rag.llm import chat
from app.services import chat_history as chat_history_svc
from app.services import claims as claims_svc
from app.services import customer_inventory as customer_inv_svc
from app.services import orders as orders_svc
from app.services import sla as sla_svc
from app.services import users as users_svc
from app.services import vendor_inventory as vendor_inv_svc

logger = logging.getLogger("erp_app.chatbot")

MAX_ITEMS = 25  # cap each list so the prompt stays small — demo datasets are tiny anyway
SLA_TOP_K = 4

# Unicode script ranges → language name, checked in order (distinguishing
# scripts first). Devanagari covers both Hindi and Marathi — labelled Hindi
# since that's overwhelmingly the more common case here; either way the
# model gets a concrete, unambiguous target language instead of guessing.
_SCRIPT_RANGES: list[tuple[str, re.Pattern]] = [
    ("Bengali", re.compile(r"[ঀ-৿]")),
    ("Tamil", re.compile(r"[஀-௿]")),
    ("Telugu", re.compile(r"[ఀ-౿]")),
    ("Gujarati", re.compile(r"[઀-૿]")),
    ("Kannada", re.compile(r"[ಀ-೿]")),
    ("Punjabi", re.compile(r"[਀-੿]")),
    ("Hindi", re.compile(r"[ऀ-ॿ]")),
]


def _detect_language(text: str) -> str:
    """Best-effort language name for `text`, by Unicode script. Defaults to
    English for Latin script / anything unrecognized (also covers code-mixed
    "Hinglish"-style romanized text, which has no distinguishing script)."""
    for name, pattern in _SCRIPT_RANGES:
        if pattern.search(text):
            return name
    return "English"


ROLE_DESCRIPTIONS = {
    "admin": "an administrator who can see all vendors, customers, orders, and claims",
    "vendor": "a vendor, seeing only their own orders, claims, inventory, and uploaded SLA",
    "customer": "a customer, seeing only their own orders, claims, inventory, and the SLAs of vendors they're linked to",
    "warehouse": "a warehouse operator with full visibility across all vendors, customers, orders, and claims",
}

SYSTEM_PROMPT_TEMPLATE = """You are the assistant built into a freight ERP portal, answering questions for \
the currently logged-in user "{username}", who is {role_description}. Answer ONLY using the data snapshot \
and SLA excerpts below — this is everything this user is allowed to see, scoped by their role. Never invent \
data, and never reveal information that isn't in the snapshot. If something isn't covered by the data, say \
so plainly rather than guessing.

Be concise and conversational, like a helpful colleague, not a report generator.

User's data snapshot (JSON):
{snapshot}

Relevant SLA excerpts for this question (if any):
{sla_excerpts}

IMPORTANT — reply language: the user's current question is written in {reply_language}. Respond ONLY in \
{reply_language}, no matter what language earlier turns in this conversation used. If the user switches \
language between questions, switch your reply language with them every time — always match the CURRENT \
question, never the conversation history.
"""


def _display_name(username: str | None) -> str | None:
    """Return company_name > display_name > username for a given username."""
    if not username:
        return None
    user = users_svc.get_user_by_username(username)
    if not user:
        return username
    return user.get("company_name") or user.get("display_name") or username


def _compact_orders(orders: list[dict]) -> list[dict]:
    return [
        {
            "order_number": o.get("order_number"),
            "vendor": _display_name(o.get("vendor_username")),
            "customer": _display_name(o.get("customer_username")),
            "status": o.get("status"),
            "items": o.get("items"),
            "requested_at": o.get("requested_at") or o.get("created_at"),
            "undelivered_reason": o.get("undelivered_reason"),
        }
        for o in orders[:MAX_ITEMS]
    ]


def _compact_claims(claims: list[dict]) -> list[dict]:
    return [
        {
            "claim_number": c.get("claim_number"),
            "vendor": c.get("vendor_company_name") or _display_name(c.get("vendor_username")),
            "customer": c.get("customer_company_name") or _display_name(c.get("customer_username")),
            "order_id": c.get("order_id"),
            "sku": c.get("sku"),
            "damage_type": c.get("damage_type"),
            "damaged_qty": c.get("damaged_qty"),
            "status": c.get("status"),
            "decision_reason": c.get("decision_reason"),
            "created_at": c.get("created_at"),
        }
        for c in claims[:MAX_ITEMS]
    ]


def _compact_inventory(items: list[dict]) -> list[dict]:
    keep_keys = {
        "sku",
        "item_name",
        "qty_on_hand",
        "reorder_threshold",
        "manufacturing_critical",
        "vendor_username",
        "customer_username",
    }
    return [{k: v for k, v in item.items() if k in keep_keys} for item in items[:MAX_ITEMS]]


def _gather_context(current_user: dict) -> dict:
    role = current_user["role"]
    username = current_user["username"]

    orders = orders_svc.list_orders_for(current_user)
    claims = claims_svc.list_claims_for(current_user)
    slas = sla_svc.list_slas_for(current_user)

    inventory: list[dict] = []
    if role == "vendor":
        inventory = vendor_inv_svc.list_inventory(vendor_username=username)
    elif role == "customer":
        inventory = customer_inv_svc.list_inventory(customer_username=username)
    elif role in ("admin", "warehouse", "procurement_officer", "inventory_controller", "finance_officer"):
        inventory = vendor_inv_svc.list_inventory()

    return {
        "role": role,
        "username": username,
        "order_count": len(orders),
        "claim_count": len(claims),
        "orders": _compact_orders(orders),
        "claims": _compact_claims(claims),
        "inventory": _compact_inventory(inventory),
        "slas": [
            {
                "sla_id": s["id"],
                "vendor": s.get("vendor_username"),
                "filename": s.get("sla_document_filename"),
                "liability_summary": s.get("liability_summary"),
            }
            for s in slas
        ],
    }


def _retrieve_sla_chunks(slas: list[dict], question: str, trace_id: str | None) -> list[str]:
    """Semantic search across every SLA this user can access, merged — grounds SLA-specific
    answers in the actual document text rather than just the cached one-line summary."""
    if not slas:
        return []
    query_embedding = embed_query(question, trace_id=trace_id)
    if query_embedding is None:
        return []
    chunks: list[str] = []
    for sla in slas:
        collection_name = f"sla_{sla['sla_id']}"
        if vector_store.collection_count(collection_name) == 0:
            continue
        results = vector_store.query(collection_name, query_embedding, top_k=SLA_TOP_K)
        chunks.extend(results.get("documents", []))
    return chunks


def answer(question: str, current_user: dict, session_id: str, trace_id: str | None = None) -> str:
    context = _gather_context(current_user)
    sla_chunks = _retrieve_sla_chunks(context["slas"], question, trace_id)

    snapshot = {
        "order_count": context["order_count"],
        "claim_count": context["claim_count"],
        "orders": context["orders"],
        "claims": context["claims"],
        "inventory": context["inventory"],
        "slas": [{"vendor": s["vendor"], "summary": s["liability_summary"]} for s in context["slas"]],
    }

    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
        username=context["username"],
        role_description=ROLE_DESCRIPTIONS.get(context["role"], context["role"]),
        snapshot=json.dumps(snapshot, default=str),
        sla_excerpts="\n\n---\n\n".join(sla_chunks) if sla_chunks else "(none retrieved for this question)",
        reply_language=_detect_language(question),
    )

    history = chat_history_svc.get_recent_messages(context["username"], session_id)
    reply = chat(system_prompt, question, name="portal_chatbot", temperature=0.3, trace_id=trace_id, history=history)

    chat_history_svc.append_message(context["username"], session_id, "user", question)
    if reply is None:
        return "Sorry, I couldn't reach the AI service right now (check API_ENDPOINT/API_KEY). Please try again shortly."
    chat_history_svc.append_message(context["username"], session_id, "assistant", reply)
    return reply

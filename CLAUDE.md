# Freight AI & ERP — Claude Code Context

This file is the authoritative briefing for any Claude Code session working on this project.
Read it in full before making any changes.

---

## Project Overview

A two-app freight platform:

| App | Purpose | Ports |
|-----|---------|-------|
| **erp-app** | Portal for vendors, customers, warehouse operators, and admins to manage orders, claims, inventory, and SLAs | Frontend: 5173, Backend: 8001 |
| **ai-app** | AI-powered claims pipeline — ingests documents/photos, runs multi-agent reasoning, auto-decides freight claims | Frontend: 5174, Backend: 8002 |

Both apps share a single root `.env` file and a single Python virtualenv (`.venv` at project root).

---

## Repository Structure

```
Freight-AI-and-ERP-main/
├── .env                        # All config — shared by both apps
├── .venv/                      # Shared Python venv (Python 3.11+)
├── erp-app/
│   ├── backend/                # FastAPI (Python)
│   │   └── app/
│   │       ├── main.py         # truststore injection at very top
│   │       ├── auth.py         # Session-based RBAC (in-memory tokens, 12h TTL)
│   │       ├── config.py       # All config from env vars
│   │       ├── chatbot.py      # Portal chatbot — multilingual, SLA-grounded
│   │       ├── store.py        # Collection class — flat JSON file data store
│   │       ├── services/       # Business logic (orders, claims, sla, alerts, users…)
│   │       ├── routers/        # FastAPI route handlers
│   │       ├── rag/            # SLA RAG pipeline (ChromaDB, embeddings, LLM)
│   │       └── data/           # JSON flat files (users, orders, claims, inventory…)
│   └── frontend/               # React + TypeScript + Vite + Tailwind
│       └── src/
│           ├── pages/          # Login, Dashboard, Orders, Claims, Users…
│           ├── components/     # UI kit (Card, Button, Input, Select, Modal…)
│           └── lib/            # auth.tsx, api.ts, types.ts
└── ai-app/
    ├── backend/                # FastAPI (Python)
    │   └── app/
    │       ├── main.py         # truststore injection at very top
    │       ├── llm_client.py   # Central LLM client (all models via org gateway)
    │       ├── chatbot.py      # AI-app chatbot (FreightBot)
    │       ├── agents/         # Multi-agent claims pipeline
    │       ├── providers/      # gemini_client.py, groq_client.py (both route via gateway)
    │       └── config/
    │           ├── models.py   # Model role table (override via env vars)
    │           └── agents.py   # Langfuse-only observability config
    └── frontend/               # React + TypeScript + Vite + Tailwind
        └── src/pages/          # CaseIntake, CaseDetail, KpiDashboard, Chatbot…
```

---

## Environment Configuration

**File:** `.env` at the project root (loaded by both backends via `python-dotenv`).

```env
# LLM Gateway — MUST end in /v1 (OpenAI SDK does NOT auto-append it)
API_ENDPOINT=https://genailab.tcs.in/v1
API_KEY=sk-aq0XTODtsgwkKpUjNB5LXg

# Ports
ERP_HOST=127.0.0.1
ERP_PORT=8001
AI_HOST=127.0.0.1
AI_PORT=8002

# Model role table (ai-app) — override to swap models without code changes
MODEL_VISION=gemini-2.5-flash
MODEL_TRANSCRIBE=azure/genailab-maas-whisper
MODEL_EMBEDDING=azure/genailab-maas-text-embedding-3-large
MODEL_REASONING=azure_ai/Llama-3.3-70B-Instruct_Mass
MODEL_AGENT=azure/genailab-maas-gpt-4.1-mini
MODEL_FAST_SLM=azure/genailab-maas-gpt-4.1-nano
MODEL_CHAT=azure/genailab-maas-gpt-4.1
MODEL_TRANSLATE=azure/genailab-maas-gpt-4.1-nano

# SLA RAG (erp-app)
RAG_CHAT_MODEL=azure_ai/Llama-3.3-70B-Instruct_Mass
RAG_EMBEDDING_MODEL=azure/genailab-maas-text-embedding-3-large

# Langfuse observability (leave blank to disable silently)
LANGFUSE_PUBLIC_KEY=pk-lf-6578e6f7-c13f-4043-a2fa-d3ed305b119c
LANGFUSE_SECRET_KEY=sk-lf-74699eb9-3968-4da9-af48-fd0b19c3f539
LANGFUSE_HOST=https://us.cloud.langfuse.com
```

### Critical invariants — DO NOT change these

| What | Correct value | Why |
|------|--------------|-----|
| `API_ENDPOINT` suffix | Must end in `/v1` | OpenAI Python SDK does not auto-append `/v1` |
| `MODEL_REASONING` | `azure_ai/Llama-3.3-70B-Instruct_Mass` | The `genailab-maas-` prefixed variant returns 404 DeploymentNotFound |
| `RAG_CHAT_MODEL` | `azure_ai/Llama-3.3-70B-Instruct_Mass` | Same as above |
| Auth header | `Authorization: Bearer <key>` | Gateway uses OpenAI-compatible auth |

---

## LLM Gateway Integration

All model calls — in both apps — route through the corporate LiteLLM-style proxy at `https://genailab.tcs.in/v1`.

- **Python (ai-app):** `ai-app/backend/app/llm_client.py` — calls `openai.OpenAI(base_url=API_ENDPOINT, api_key=API_KEY)`. Use `llm_client.chat(role, messages)` everywhere. Model roles defined in `ai-app/backend/app/config/models.py`.
- **Python (erp-app RAG):** `erp-app/backend/app/rag/llm.py` and `rag/embeddings.py` — same OpenAI client pattern, uses `RAG_CHAT_MODEL` / `RAG_EMBEDDING_MODEL`.
- **SSL trust (corporate CA):** Both `main.py` files inject the OS certificate store at startup:
  ```python
  import truststore
  truststore.inject_into_ssl()   # must be at the very top of main.py
  ```
  `truststore` is in both `requirements.txt` files. **Never remove this.**

---

## RBAC — User Roles

Four roles. The `warehouse` role was added alongside the original three and has admin-level permissions everywhere.

| Role | Display name | Permissions |
|------|-------------|-------------|
| `admin` | Admin | Full platform access |
| `warehouse` | Eastern Warehouse | Full platform access (same as admin) |
| `vendor` | Vendor | Own orders, own claims, own inventory, own SLA |
| `customer` | Customer | Own orders, own claims, own inventory, linked-vendor SLAs |

### Where roles are enforced

- **Backend:** `erp-app/backend/app/auth.py` — `require_role()` dependency. Every router that was `admin`-only now uses `("admin", "warehouse")`. `SIGNUP_ROLES = {"vendor", "customer", "warehouse"}` (admin cannot self-register).
- **Frontend types:** `erp-app/frontend/src/lib/types.ts` — `Role = "admin" | "vendor" | "customer" | "warehouse"`
- **Frontend routing:** `erp-app/frontend/src/App.tsx` — admin routes accept `["admin", "warehouse"]`
- **Frontend nav:** `erp-app/frontend/src/components/Layout.tsx` — warehouse gets same nav as admin, displayed as "Eastern Warehouse"
- **Frontend login:** `erp-app/frontend/src/pages/Login.tsx` — Sign Up dropdown: Customer / Vendor / Eastern Warehouse. Sign In dropdown (added): Customer / Vendor / Eastern Warehouse / Admin. The Sign In dropdown validates the selected role against the returned role and shows an error on mismatch, then logs out the mismatched session.

---

## Data Store

**erp-app** uses **Supabase (PostgreSQL)** as its database. Connection is via the `supabase-py` client using `SUPABASE_URL` and `SUPABASE_KEY` from `.env`.

```env
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=eyJ...   # service_role JWT from Supabase Settings → API
```

> **Key type matters:** `SUPABASE_KEY` must be the `service_role` JWT (starts with `eyJ…`), **not** the Management API key (`sb_secret_…`). The `sb_secret_` key is for the Supabase Management API and will return a 401 from PostgREST.

Key tables:

| Table | Contents |
|-------|---------|
| `users` | All user accounts |
| `orders` | All orders |
| `claims` | All freight claims |
| `vendor_inventory` | Vendor stock items |
| `customer_inventory` | Customer received stock |
| `vendor_sla` | Uploaded SLA documents (metadata) |
| `customer_vendor_links` | Which customers are linked to which vendors |
| `purchase_orders` | Vendor purchase orders (Supabase only) |

The Supabase client is instantiated per-request via `create_client(SUPABASE_URL, SUPABASE_KEY)` in each router. No restart needed for schema/data changes made directly in Supabase.

Default admin account: `admin / Admin@123`

---

## ERP Portal Chatbot

**File:** `erp-app/backend/app/chatbot.py`

- Answers questions about the logged-in user's own data (orders, claims, inventory, SLAs).
- **Multilingual:** language is detected server-side using Unicode script ranges (Bengali, Tamil, Telugu, Gujarati, Kannada, Punjabi, Hindi, fallback English). The detected language is injected explicitly into every system prompt call — the model is told "respond ONLY in {language}" on every turn. This prevents drift when history contains multiple languages.
- **SLA RAG:** questions are also answered using ChromaDB semantic search over the user's uploaded SLA documents.
- **Chat history:** sessions per user, persisted to disk, capped by `CHATBOT_HISTORY_RETENTION_DAYS` and `CHATBOT_HISTORY_MAX_TURNS`.

### TTS (Text-to-Speech)

**File:** `erp-app/frontend/src/pages/Chatbot.tsx`

Browser-native `speechSynthesis` Web Speech API. Language is auto-detected from the reply text using the same Unicode script ranges. Each assistant message has a "Listen" / "Stop" toggle button. No backend calls, no API key required.

---

## AI App — Multi-Agent Claims Pipeline

**Entry:** `ai-app/backend/app/agents/orchestrator.py`

Agents (all in `ai-app/backend/app/agents/`):

| Agent | Role |
|-------|------|
| `context_agent.py` | Fetches order/SLA context from ERP via MCP |
| `inspector_agent.py` | Analyses damage photos (vision model) |
| `policy_agent.py` | Checks SLA policy compliance |
| `inventory_agent.py` | Checks inventory impact |
| `reorder_agent.py` | Recommends reorder actions |
| `claim_agent.py` | Makes the final claim decision |
| `governance_agent.py` | Reviews the decision for bias/fairness |
| `confidence.py` | Scores overall pipeline confidence |

The ERP app exposes an MCP server (`erp-app/backend/app/mcp_server.py`). The AI app connects as an MCP client (`ai-app/backend/app/mcp_client.py`).

---

## Running the Apps

```bash
# From project root — activate the shared venv first
.venv\Scripts\activate

# ERP backend
cd erp-app/backend && uvicorn app.main:app --port 8001 --reload

# ERP frontend (separate terminal)
cd erp-app/frontend && npm run dev   # → http://localhost:5173

# AI backend (separate terminal)
cd ai-app/backend && uvicorn app.main:app --port 8002 --reload

# AI frontend (separate terminal)
cd ai-app/frontend && npm run dev    # → http://localhost:5174
```

The `.claude/launch.json` pre-configures all four servers for the Claude Code preview tool.

---

## Features Implemented (Session History)

- [x] **Org LLM gateway integration** — replaced all free-tier API keys (Gemini, Groq, OpenAI personal) with the corporate LiteLLM proxy. Single `API_ENDPOINT` / `API_KEY` for everything.
- [x] **Corporate SSL trust** — `truststore.inject_into_ssl()` in both backends fixes `CERTIFICATE_VERIFY_FAILED` against the internal CA.
- [x] **Multilingual chatbot (ERP)** — Unicode script detection server-side, language injected into every prompt. Fixes language drift when switching between English and Indian scripts mid-conversation.
- [x] **Text-to-speech (ERP chatbot)** — browser Web Speech API with auto language detection from reply text. "Listen" / "Stop" per message.
- [x] **Eastern Warehouse role** — new `warehouse` role with full admin-parity permissions across all backends, routers, frontend nav, routing, dashboards, and user management.
- [x] **Sign Up dropdown** — Customer / Vendor / Eastern Warehouse options on the Sign Up form.
- [x] **Sign In user type dropdown** — Customer / Vendor / Eastern Warehouse / Admin on the Sign In form; validates role after login and rejects mismatch with a clear error message.
- [x] **Data wipe** — wiped all orders, claims, vendor/customer accounts, inventory, SLAs, links for a clean slate (admin account preserved).
- [x] **Supabase migration** — all services (users, orders, claims, vendor_inventory, customer_inventory, customer_vendor_links, vendor_sla, alerts, audit_logs) rewritten to use Supabase PostgreSQL via `app/db.py`. `store.py` / `Collection` class retained only for `chat_history`. SQL DDL + seed data in `erp-app/backend/supabase_migration.sql`.

---

## Known Issues & Decisions

- **ChromaDB vector_cache files** (`erp-app/backend/vector_cache/`) may be left behind from previous SLA uploads. They are harmless if the `vendor_sla` table is empty — they will simply never be queried.
- **Sessions are in-memory** — restarting the ERP backend clears all active sessions (users must log in again). This is by design for the demo.
- **Supabase key type** — `SUPABASE_KEY` must be the `service_role` JWT from Supabase Settings → API. Using the Management API key (`sb_secret_…`) causes a 401 PostgREST error on every query.
- **`auth.py` login does not return `role` validation** — the role check on Sign In is frontend-only (Login.tsx). The backend returns whatever role the account actually has; the frontend compares and rejects mismatches. This is correct: the backend's source of truth is the stored role, not what the user typed in the dropdown.

---

## Suggested Future Enhancements

- [ ] Persist sessions to disk / Redis so backend restarts don't log everyone out
- [ ] Add email notifications on claim decisions
- [ ] Add a vendor SLA expiry reminder (alert when SLA nears end date)
- [ ] Add pagination / search to Orders and Claims lists (they grow unbounded)
- [ ] Replace flat JSON data store with SQLite for atomic writes and concurrent access safety
- [ ] Add a Super Admin role that can manage warehouse operators (currently warehouse self-registers)
- [ ] RAG evaluation pipeline currently references "Groq judge" in UI copy — update to reflect the org gateway judge model
- [ ] Add export to CSV/PDF for Orders and Claims views
- [ ] AI app: surface per-agent confidence scores in the CaseDetail UI
- [ ] Add webhook / real-time push for order status changes (currently poll-based)

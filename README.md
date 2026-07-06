# Agentic Multimodal QA & Automated Freight Reconciliation

Two independent apps in one repo:

- **`erp-app/`** — Freight ERP. System of record modeling a real customer↔vendor relationship: admins run the platform, vendors fulfill orders and adjudicate claims, customers place orders and raise claims against vendors they're linked to. Acts as an **MCP Server**.
- **`ai-app/`** — Freight AI. Multimodal multi-agent pipeline (video/audio intake → SLA policy RAG → inventory impact → claim/alert generation), conversational bot, KPI dashboard, logs/exceptions. Acts as an **MCP Client** of the ERP app and a client of an external LLM gateway.

## Prerequisites
- Python 3.10+
- Node.js 18+
- `ffmpeg` on PATH (required for the AI app's video pipeline — frame + audio extraction)
- An OpenAI-compatible LLM gateway endpoint + key (see below)

## 1. Configure the LLM gateway
Copy `.env.example` to `.env` in the repo root **and** into `ai-app/backend/.env`, then fill in your real values:

```
API_ENDPOINT=...
API_KEY=...
```

Model routing (cheap vs. heavy tasks) is configured in `ai-app/backend/app/config/models.py` and can be overridden via env vars (`MODEL_VISION`, `MODEL_TRANSCRIBE`, `MODEL_EMBEDDING`, `MODEL_REASONING`, `MODEL_AGENT`, `MODEL_FAST_SLM`, `MODEL_CHAT`, `MODEL_TRANSLATE`).

## 2. Run the ERP app (MCP Server) — port 8001 / 5173

```bash
cd erp-app/backend
pip install -r requirements.txt
uvicorn app.main:app --port 8001
```
First run auto-seeds `data/*.json` and generates one synthetic SLA PDF per vendor in `data/sla_documents/`. Swagger docs: http://127.0.0.1:8001/docs. MCP endpoint: http://127.0.0.1:8001/mcp.

```bash
cd erp-app/frontend
npm install
npm run dev
```
Open http://localhost:5173. Roles are **admin / vendor / customer**, with `username` as the primary key (no numeric user id). Demo logins:

| Username/Password | Role | Notes |
|---|---|---|
| `admin` / `admin` | admin | full access to everything |
| `vendorx` / `vendorx` | vendor | "Vendor X" — linked to Customer A and Customer B |
| `vendory` / `vendory` | vendor | "Vendor Y" — linked to Customer B only |
| `vendorz` / `vendorz` | vendor | "Vendor Z" — linked to Customer A and Customer B |
| `customera` / `customera` | customer | "Customer A" — deals with Vendor X and Vendor Z |
| `customerb` / `customerb` | customer | "Customer B" — deals with all three vendors |

**ERP demo flow:** log in as `customera`, go to **Orders**, create a new order against `vendorx` (you can't order from `vendory` — not linked, the API 403s it). Log in as `vendorx`, see the order under **Orders**, mark it *Delivered* (this credits `customera`'s **Customer Inventory**) — an alert fires to `customera`. Back as `customera`, go to **Claims**, raise a claim against that delivered order — an alert fires to `vendorx`. As `vendorx`, **Approve** or **Reject** the claim (with a reason) under **Claims** — an alert fires back to `customera`. Try **Upload SLA** as a vendor and **SLA** (view) as a customer — customers only see SLAs of vendors they're linked to. Vendors also have a **My Customers** tab showing their linked customers with order/claim counts.

## 3. Run the AI app (MCP Client) — port 8002 / 5174
Requires the ERP backend already running on 8001.

```bash
cd ai-app/backend
pip install -r requirements.txt
uvicorn app.main:app --port 8002
```

```bash
cd ai-app/frontend
npm install
npm run dev
```
Open http://localhost:5174. Same demo logins as ERP (this app proxies auth to the ERP backend).

## Demo flow
1. Log into the AI app, go to **Case Intake**.
2. Upload a short video clip (drop your own / organizer-provided clip into `ai-app/backend/data/sample_videos/` or upload directly), or use the **manual transcript override** field for a quick test, e.g.:
   `Pallet arrived wet, three boxes of microchips are ruined, PO is PO-5543`
3. Run the pipeline — watch Intake → Policy (SLA RAG) → Inventory (MCP-grounded) → Claim agents execute in sequence.
4. Open **Case Detail** to see the liability verdict with cited SLA clauses, inventory shortfall/manufacturing-halt-risk flag, and the generated claim narrative + JSON payload.
5. Check the ERP app's **Claims** / **Alerts** tabs (as `admin`, who sees everything) — the agent-created records appear there for human review.

> **Note:** the ERP app's data model was reworked to the admin/vendor/customer flow described above; the AI app's MCP client (`ai-app/backend/app/mcp_client.py`) still targets the OLD ERP tool contracts (e.g. `get_purchase_order`, `get_vendor_sla_text(vendor_id: int)`, `create_claim(payload)`/`create_alert(payload)`) and has not yet been updated to match the new ERP tools (`get_order`, `get_vendor_sla_text(vendor_username)`, `list_vendor_inventory`, `update_vendor_inventory_qty`, explicit-kwarg `create_claim`/`create_alert`). Running the AI app's end-to-end pipeline against the ERP MCP server will fail at those calls until `ai-app` is updated to match — that update is a known follow-up, not yet done.
6. Check the AI app's **KPI Dashboard** and **Logs & Exceptions** pages for per-agent performance and any failures.
7. Try the **Chat Bot** (text or mic) — e.g. "What's the status of PO 5543?" — and the EN/HI language toggle.

## Capability map
| Requirement | Where |
|---|---|
| Multi-Agent System | `ai-app/backend/app/agents/` (orchestrator + intake/policy/inventory/claim agents) |
| MCP Protocol | `erp-app/backend/app/mcp_server.py` (server) ↔ `ai-app/backend/app/mcp_client.py` (client) |
| Logs & Exceptions | `ai-app/backend/app/logging_store.py`, `erp-app` audit logs, both "Logs"/"Audit" UI pages |
| Agent KPI Dashboard | `ai-app/backend/app/routers/kpi.py` + `ai-app/frontend` KPI page |
| RAG Types | Document RAG (`ai-app/backend/app/rag/policy_rag.py`) + tool/API-grounded retrieval via MCP |
| RBAC | `erp-app/backend/app/auth.py` (admin/vendor/customer, username as primary key) |
| Multimodal | `ai-app/backend/app/media_pipeline.py` + `llm_client.py` (vision + transcription) |
| Agentic Tooling | MCP tools + OpenAI function-calling in `routers/chat.py` |
| Conversational Bot | `ai-app/frontend` Chat Bot page + `routers/chat.py` |
| API Stack | FastAPI + OpenAPI docs in both backends |
| SLM/Contextual LLM + Model Optimization | `ai-app/backend/app/config/models.py` tiered routing + per-call token/latency logging |
| Voice Interface | Browser Web Speech API (mic + TTS) in Chat Bot; Whisper transcription in intake pipeline |
| Multilingual | `react-i18next` (EN/HI) + backend translation model |
| UI Framework | React + Vite + TypeScript + Tailwind, both frontends |

## Known limitations
- Live LLM calls require real gateway credentials in `.env` — without them, the AI pipeline still runs mechanically (MCP calls, RAG retrieval up to the embedding call, orchestration, logging) but the LLM-dependent steps return a structured error rather than content. This is by design — the app never crashes on a gateway failure.
- The video pipeline needs `ffmpeg` on PATH and a real video file; a manual-transcript override field exists for testing the rest of the pipeline without one.

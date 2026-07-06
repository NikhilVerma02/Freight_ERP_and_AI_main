from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

# Use the OS certificate store (not certifi) for all outbound HTTPS — needed
# to trust internal/corporate CAs (e.g. the organisational LLM gateway) that
# aren't in Python's bundled cert store. Must run before any httpx/openai
# client is constructed.
import truststore

truststore.inject_into_ssl()

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load root .env (two levels up: ai-app/backend/app/main.py -> project root)
_ROOT_ENV = Path(__file__).parent.parent.parent.parent / ".env"
if _ROOT_ENV.exists():
    load_dotenv(_ROOT_ENV)
else:
    load_dotenv()  # fall back to default search behavior

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("ai_app.main")

from app.mcp_client import ErpMcpClient, McpClientError, set_erp_mcp_client  # noqa: E402
from app.middleware import ApiLoggingMiddleware  # noqa: E402
from app.routers.auth import router as auth_router  # noqa: E402
from app.routers.ingest import router as ingest_router  # noqa: E402
from app.routers.kpi import router as kpi_router  # noqa: E402
from app.routers.logs import router as logs_router  # noqa: E402
from app.routers.observability import router as observability_router  # noqa: E402
from app.routers.chat import router as chat_router  # noqa: E402
from app.routers.records import router as records_router  # noqa: E402
from app.routers.users import router as users_router  # noqa: E402

ERP_MCP_URL = os.environ.get("ERP_MCP_URL", "http://127.0.0.1:8001/mcp/")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Startup: case history retained (agent_logs.json/agent_runs.json preserved across restarts)")
    client = ErpMcpClient(ERP_MCP_URL)
    try:
        await client.connect()
        set_erp_mcp_client(client)
        logger.info("Startup: ERP MCP client connected at %s", ERP_MCP_URL)
    except McpClientError as exc:
        # Don't crash the whole app if the ERP isn't up yet — log loudly and let
        # endpoints that need it fail individually with a clear 503.
        logger.error("Startup: ERP MCP client failed to connect (%s). AI backend will still boot; "
                     "ingest endpoints will return 503 until the ERP is reachable.", exc)
        set_erp_mcp_client(None)
    yield
    if client.session is not None:
        await client.close()
        logger.info("Shutdown: ERP MCP client closed")


app = FastAPI(title="Freight AI API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5174", "http://127.0.0.1:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(ApiLoggingMiddleware)

app.include_router(auth_router)
app.include_router(chat_router)
app.include_router(ingest_router)
app.include_router(kpi_router)
app.include_router(logs_router)
app.include_router(records_router)
app.include_router(users_router)
app.include_router(observability_router)


@app.get("/")
def root():
    return {
        "status": "ok",
        "service": "Freight AI API",
        "erp_mcp_url": ERP_MCP_URL,
        "docs": "/docs",
    }

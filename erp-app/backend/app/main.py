from __future__ import annotations

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

# Load root .env (two levels up: erp-app/backend/app/main.py -> project root)
_ROOT_ENV = Path(__file__).parent.parent.parent.parent / ".env"
if _ROOT_ENV.exists():
    load_dotenv(_ROOT_ENV)
else:
    load_dotenv()  # fall back to default search behavior

from app.auth import router as auth_router
from app.mcp_server import mcp
from app.middleware import ApiLoggingMiddleware
from app.routers.alerts import router as alerts_router
from app.routers.audit_logs import router as audit_logs_router
from app.routers.chatbot import router as chatbot_router
from app.routers.claims import router as claims_router
from app.routers.customer_inventory import router as customer_inventory_router
from app.routers.customers import router as customers_router
from app.routers.links import router as links_router
from app.routers.observability import router as observability_router
from app.routers.orders import router as orders_router
from app.routers.users import router as users_router
from app.routers.vendor_inventory import router as vendor_inventory_router
from app.routers.vendors import router as vendors_router
from app.routers.purchase_orders import router as purchase_orders_router
from app.routers.sales_orders import router as sales_orders_router
from app.seed import run_seed

# Build the MCP ASGI app. fastmcp 2.x exposes `http_app()`; older releases
# used `streamable_http_app()`. Try the modern name first and fall back.
if hasattr(mcp, "http_app"):
    mcp_asgi_app = mcp.http_app(path="/")
elif hasattr(mcp, "streamable_http_app"):
    mcp_asgi_app = mcp.streamable_http_app(path="/")
else:  # pragma: no cover - defensive fallback for unexpected fastmcp versions
    raise RuntimeError("Installed fastmcp version exposes neither http_app() nor streamable_http_app()")


@asynccontextmanager
async def lifespan(app: FastAPI):
    run_seed()
    # fastmcp's http_app() returns a Starlette app with its own lifespan that
    # manages the underlying session manager; running it ensures the MCP
    # transport is properly initialized when mounted as a sub-app.
    async with mcp_asgi_app.lifespan(mcp_asgi_app):
        yield


app = FastAPI(title="Freight ERP API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
        "http://localhost:5176",
        "http://127.0.0.1:5176",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(ApiLoggingMiddleware)

app.include_router(auth_router)
app.include_router(orders_router)
app.include_router(claims_router)
app.include_router(vendor_inventory_router)
app.include_router(customer_inventory_router)
app.include_router(vendors_router)
app.include_router(customers_router)
app.include_router(links_router)
app.include_router(alerts_router)
app.include_router(users_router)
app.include_router(audit_logs_router)
app.include_router(observability_router)
app.include_router(chatbot_router)
app.include_router(purchase_orders_router)
app.include_router(sales_orders_router)

app.mount("/mcp", mcp_asgi_app)


@app.get("/")
def root():
    return {
        "status": "ok",
        "service": "Freight ERP API",
        "mcp_endpoint": "/mcp",
        "docs": "/docs",
    }

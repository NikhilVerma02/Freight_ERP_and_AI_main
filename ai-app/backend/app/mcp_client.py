"""
MCP client for talking to the ERP's streamable-HTTP MCP server (mounted at
ERP_MCP_URL, default http://127.0.0.1:8001/mcp/). Opens one persistent
ClientSession at FastAPI startup (see app/main.py lifespan) and exposes a
typed async wrapper method per ERP tool for the agents to call.

Tool wrappers here must match erp-app/backend/app/mcp_server.py exactly
(names + params) — that file is the source of truth for the contract.
"""
from __future__ import annotations

import json
import logging
from contextlib import AsyncExitStack
from typing import Any

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

logger = logging.getLogger("ai_app.mcp_client")


class McpClientError(Exception):
    """Raised when the MCP connection or a tool call fails. Caught per-agent by the orchestrator."""


def _unwrap_result(result: Any) -> Any:
    """Unwrap a CallToolResult into a plain Python value.

    Prefers `structuredContent` (fastmcp populates this for dict/list
    returns); falls back to parsing the first TextContent block as JSON,
    then to its raw text.
    """
    if getattr(result, "isError", False):
        text = ""
        for block in getattr(result, "content", []) or []:
            text += getattr(block, "text", "") or ""
        raise McpClientError(f"MCP tool call returned an error: {text or result}")

    structured = getattr(result, "structuredContent", None)
    if structured is not None:
        # fastmcp wraps bare list/scalar returns as {"result": ...}
        if isinstance(structured, dict) and set(structured.keys()) == {"result"}:
            return structured["result"]
        return structured

    content = getattr(result, "content", None) or []
    if content:
        first = content[0]
        text = getattr(first, "text", None)
        if text is not None:
            try:
                return json.loads(text)
            except (json.JSONDecodeError, TypeError):
                return text
    return None


class ErpMcpClient:
    """Persistent MCP client session against the ERP's /mcp endpoint."""

    def __init__(self, url: str):
        self.url = url
        self._stack: AsyncExitStack | None = None
        self.session: ClientSession | None = None

    async def connect(self, force: bool = False) -> None:
        if self.session is not None:
            if not force:
                return
            await self.close()
        self._stack = AsyncExitStack()
        try:
            read_stream, write_stream, _get_session_id = await self._stack.enter_async_context(
                streamablehttp_client(self.url)
            )
            session = await self._stack.enter_async_context(ClientSession(read_stream, write_stream))
            await session.initialize()
            self.session = session
            logger.info("Connected to ERP MCP server at %s", self.url)
        except Exception as exc:
            await self._stack.aclose()
            self._stack = None
            self.session = None
            logger.error("Failed to connect to ERP MCP server at %s: %s", self.url, exc)
            raise McpClientError(f"Could not connect to ERP MCP server at {self.url}: {exc}") from exc

    async def close(self) -> None:
        if self._stack is not None:
            try:
                await self._stack.aclose()
            except Exception as exc:  # the remote side may already be gone (e.g. ERP restarted)
                logger.warning("Error closing stale MCP session (ignoring): %s", exc)
        self._stack = None
        self.session = None

    async def _call(self, name: str, arguments: dict | None = None, _retried: bool = False) -> Any:
        if self.session is None:
            raise McpClientError("MCP session is not connected. Call connect() first (or check startup logs).")
        try:
            result = await self.session.call_tool(name, arguments or {})
            return _unwrap_result(result)
        except McpClientError:
            raise
        except Exception as exc:
            if not _retried:
                # The ERP process may have restarted since this session was opened (its old
                # session id is now dead server-side) — reconnect once and retry transparently
                # instead of surfacing a confusing "Session terminated" error to every caller.
                logger.warning("MCP tool call '%s' failed (%s) — reconnecting and retrying once", name, exc)
                try:
                    await self.connect(force=True)
                    return await self._call(name, arguments, _retried=True)
                except Exception as reconnect_exc:
                    logger.error("MCP reconnect-and-retry failed: %s", reconnect_exc)
                    raise McpClientError(f"MCP tool call '{name}' failed after reconnect attempt: {reconnect_exc}") from reconnect_exc
            logger.error("MCP tool call '%s' failed: %s", name, exc)
            raise McpClientError(f"MCP tool call '{name}' failed: {exc}") from exc

    # ------------------------------------------------------------------
    # Typed wrappers, one per ERP MCP tool (see app/mcp_server.py).
    # ------------------------------------------------------------------
    async def list_vendors_for_customer(self, customer_username: str) -> list[dict]:
        return await self._call("list_vendors_for_customer", {"customer_username": customer_username})

    async def list_customers_for_vendor(self, vendor_username: str) -> list[dict]:
        return await self._call("list_customers_for_vendor", {"vendor_username": vendor_username})

    async def list_customer_orders(self, customer_username: str, vendor_username: str | None = None) -> list[dict]:
        return await self._call("list_customer_orders", {"customer_username": customer_username, "vendor_username": vendor_username})

    async def list_vendor_orders(self, vendor_username: str) -> list[dict]:
        return await self._call("list_vendor_orders", {"vendor_username": vendor_username})

    async def get_order_by_id(self, order_id: int) -> dict | None:
        return await self._call("get_order_by_id", {"order_id": order_id})

    async def get_purchase_order_by_id(self, po_id: int) -> dict | None:
        return await self._call("get_purchase_order_by_id", {"po_id": po_id})

    async def list_vendor_purchase_orders(self, vendor_username: str) -> list[dict]:
        return await self._call("list_vendor_purchase_orders", {"vendor_username": vendor_username})

    async def create_purchase_order(
        self,
        vendor_username: str,
        sku: str,
        item_name: str,
        quantity: int,
        created_by: str = "ai-agent",
        delivery_date: str | None = None,
        notes: str | None = None,
        source_order_number: str | None = None,
    ) -> dict:
        return await self._call("create_purchase_order", {
            "vendor_username": vendor_username,
            "sku": sku,
            "item_name": item_name,
            "quantity": quantity,
            "created_by": created_by,
            "delivery_date": delivery_date,
            "notes": notes,
            "source_order_number": source_order_number,
        })

    async def find_reorder_by_source(self, vendor_username: str, sku: str, source_order_number: str) -> dict | None:
        return await self._call("find_reorder_by_source", {
            "vendor_username": vendor_username,
            "sku": sku,
            "source_order_number": source_order_number,
        })

    async def list_customer_claims(self, customer_username: str) -> list[dict]:
        return await self._call("list_customer_claims", {"customer_username": customer_username})

    async def list_vendor_claims(self, vendor_username: str) -> list[dict]:
        return await self._call("list_vendor_claims", {"vendor_username": vendor_username})

    async def list_customer_inventory(self, customer_username: str, vendor_username: str | None = None) -> list[dict]:
        return await self._call("list_customer_inventory", {"customer_username": customer_username, "vendor_username": vendor_username})

    async def list_vendor_inventory(self, vendor_username: str | None = None) -> list[dict]:
        return await self._call("list_vendor_inventory", {"vendor_username": vendor_username})

    async def add_vendor_inventory(self, vendor_username: str, sku: str, item_name: str, qty: int) -> dict:
        return await self._call("add_vendor_inventory", {
            "vendor_username": vendor_username,
            "sku": sku,
            "item_name": item_name,
            "qty": qty,
        })

    async def get_purchase_order_by_number(self, po_number: str) -> dict | None:
        return await self._call("get_purchase_order_by_number", {"po_number": po_number})

    async def mark_po_inventory_added(self, po_number: str) -> dict | None:
        return await self._call("mark_po_inventory_added", {"po_number": po_number})

    async def find_claim_by_po_and_sku(self, po_number: str, sku: str) -> dict | None:
        return await self._call("find_claim_by_po_and_sku", {"po_number": po_number, "sku": sku})

    async def ask_vendor_sla(self, vendor_username: str, customer_username: str, question: str, run_id: str | None = None) -> dict:
        """run_id (optional): the calling pipeline run's id, forwarded so erp-app's SLA RAG
        call nests under the SAME Langfuse trace — see app/observability.py."""
        return await self._call(
            "ask_vendor_sla",
            {"vendor_username": vendor_username, "customer_username": customer_username, "question": question, "run_id": run_id},
        )

    async def create_order(self, customer_username: str, vendor_username: str, items: list[dict]) -> dict:
        return await self._call("create_order", {"customer_username": customer_username, "vendor_username": vendor_username, "items": items})

    async def create_claim(
        self, customer_username: str, order_id: int, sku: str, damage_type: str, damaged_qty: int, claim_text: str,
        vendor_username: str = "", order_number: str = "",
        claim_value: float | None = None, cost_per_unit: float | None = None,
        claim_percentage: int = 100, email_draft: str | None = None,
    ) -> dict:
        return await self._call(
            "create_claim",
            {
                "customer_username": customer_username,
                "order_id": order_id,
                "sku": sku,
                "damage_type": damage_type,
                "damaged_qty": damaged_qty,
                "claim_text": claim_text,
                "vendor_username": vendor_username,
                "order_number": order_number,
                "claim_value": claim_value,
                "cost_per_unit": cost_per_unit,
                "claim_percentage": claim_percentage,
                "email_draft": email_draft,
            },
        )

    async def get_user_by_username(self, username: str) -> dict | None:
        return await self._call("get_user_by_username", {"username": username})

    async def list_users_by_company(self, vendor_username: str) -> list[dict]:
        return await self._call("list_users_by_company", {"vendor_username": vendor_username})

    async def create_alert(
        self, audience: str, target_username: str | None, type: str, title: str, message: str, related_id: int | None = None
    ) -> dict:
        return await self._call(
            "create_alert",
            {
                "audience": audience,
                "target_username": target_username,
                "type": type,
                "title": title,
                "message": message,
                "related_id": related_id,
            },
        )

    async def search_audit_logs(self, query: str | None = None, limit: int = 50) -> list[dict]:
        return await self._call("search_audit_logs", {"query": query, "limit": limit})


# Module-level holder — connected/closed via FastAPI lifespan in app/main.py.
# A mutable dict (rather than a bare module-level variable) so other modules
# can observe updates made via set_erp_mcp_client() without needing `global`.
_holder: dict[str, ErpMcpClient | None] = {"client": None}


def set_erp_mcp_client(client: ErpMcpClient | None) -> None:
    _holder["client"] = client


def get_erp_mcp_client() -> ErpMcpClient:
    client = _holder["client"]
    if client is None:
        raise McpClientError("ERP MCP client has not been initialized yet (startup not complete).")
    return client

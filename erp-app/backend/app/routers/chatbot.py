"""POST /api/chatbot/ask — role-scoped Q&A assistant covering the logged-in
user's own orders, claims, inventory, and SLA terms. See app/chatbot.py.

/api/chatbot/sessions — manage separate conversation sessions ("New chat" +
a "Recents" list) for the caller's own account. See
app/services/chat_history.py for the retention policy."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app import chatbot, observability
from app.auth import get_current_user
from app.services import chat_history as chat_history_svc

router = APIRouter(prefix="/api/chatbot", tags=["chatbot"])


class ChatRequest(BaseModel):
    question: str
    session_id: str


class ChatResponse(BaseModel):
    answer: str


@router.post("/ask", response_model=ChatResponse)
def ask(payload: ChatRequest, current_user: dict = Depends(get_current_user)):
    if not chat_history_svc.get_session(current_user["username"], payload.session_id):
        raise HTTPException(status_code=404, detail="Chat session not found (it may have expired)")
    trace_id = observability.trace_id_for(f"chatbot_{current_user['username']}_{uuid.uuid4().hex}")
    reply = chatbot.answer(payload.question, current_user, payload.session_id, trace_id=trace_id)
    return ChatResponse(answer=reply)


@router.get("/sessions")
def list_sessions(current_user: dict = Depends(get_current_user)):
    return chat_history_svc.list_sessions(current_user["username"])


@router.post("/sessions")
def create_session(current_user: dict = Depends(get_current_user)):
    return chat_history_svc.create_session(current_user["username"])


@router.get("/sessions/{session_id}")
def get_session(session_id: str, current_user: dict = Depends(get_current_user)):
    session = chat_history_svc.get_session(current_user["username"], session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found (it may have expired)")
    return session


@router.delete("/sessions/{session_id}")
def delete_session(session_id: str, current_user: dict = Depends(get_current_user)):
    ok = chat_history_svc.delete_session(current_user["username"], session_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Chat session not found")
    return {"status": "deleted"}

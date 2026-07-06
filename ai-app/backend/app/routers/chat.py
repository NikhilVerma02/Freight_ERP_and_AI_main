from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app import chat_history, chatbot
from app.auth import get_current_user

router = APIRouter(prefix="/api/chat", tags=["chat"])


class AskRequest(BaseModel):
    session_id: str
    question: str


@router.get("/sessions")
def list_sessions(user=Depends(get_current_user)):
    return chat_history.list_sessions(user["username"])


@router.post("/sessions")
def create_session(user=Depends(get_current_user)):
    return chat_history.create_session(user["username"])


@router.get("/sessions/{session_id}")
def get_session(session_id: str, user=Depends(get_current_user)):
    s = chat_history.get_session(user["username"], session_id)
    if s is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return s


@router.delete("/sessions/{session_id}")
def delete_session(session_id: str, user=Depends(get_current_user)):
    if not chat_history.delete_session(user["username"], session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    return {"ok": True}


@router.delete("/sessions")
def clear_sessions(user=Depends(get_current_user)):
    chat_history.clear_all_sessions(user["username"])
    return {"ok": True}


@router.post("/ask")
def ask(req: AskRequest, user=Depends(get_current_user)):
    result = chatbot.ask(user["username"], req.session_id, req.question)
    if result.get("error") == "Session not found":
        raise HTTPException(status_code=404, detail="Session not found")
    return result

import os
import json
import time
import re
import shutil
from pathlib import Path
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

router = APIRouter(prefix="/chats", tags=["chats"])

class ChatSession(BaseModel):
    id: str
    title: str
    folder: str
    created_at: float
    updated_at: float

class ChatCreateRequest(BaseModel):
    title: Optional[str] = "New Project"
    folder: Optional[str] = None

class HistorySaveRequest(BaseModel):
    messages: List[Dict[str, Any]] = Field(default_factory=list)

def _get_user_files_root() -> Path:
    env_ws = os.getenv("USER_FILES_DIR") or os.getenv("WORKSPACE_DIR") or os.getenv("WORKSPACE_ROOT")
    if env_ws:
        p = Path(env_ws).resolve()
    else:
        p = Path(__file__).resolve().parent.parent.parent / "user_files"
    p.mkdir(parents=True, exist_ok=True)
    return p

def _sanitize_folder_name(name: str) -> str:
    # Lowercase, replace non-alphanumeric with underscore, strip leading/trailing underscores
    slug = re.sub(r"[^a-zA-Z0-9_\-]+", "_", name.lower()).strip("_")
    return slug[:40] if slug else "chat"

def _load_chats_meta() -> List[dict]:
    root = _get_user_files_root()
    meta_file = root / ".chats.json"
    if meta_file.exists():
        try:
            with open(meta_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass

    # Default initial chat session
    default_session = {
        "id": "chat_default",
        "title": "Main Project",
        "folder": "project_1",
        "created_at": time.time(),
        "updated_at": time.time(),
    }
    target_dir = root / "project_1"
    target_dir.mkdir(parents=True, exist_ok=True)
    
    # If any files are in user_files root (e.g. fibonacci.py), copy them to project_1
    for item in root.iterdir():
        if item.is_file() and not item.name.startswith("."):
            dest = target_dir / item.name
            if not dest.exists():
                try:
                    shutil.copy2(item, dest)
                except Exception:
                    pass

    meta = [default_session]
    _save_chats_meta(meta)
    return meta

def _save_chats_meta(chats: List[dict]):
    root = _get_user_files_root()
    meta_file = root / ".chats.json"
    with open(meta_file, "w", encoding="utf-8") as f:
        json.dump(chats, f, indent=2)

@router.get("", response_model=List[ChatSession])
async def list_chats():
    return _load_chats_meta()

@router.post("", response_model=ChatSession)
async def create_chat(req: ChatCreateRequest):
    chats = _load_chats_meta()
    timestamp = int(time.time())
    
    title = (req.title or "New Project").strip()
    if req.folder:
        folder = _sanitize_folder_name(req.folder)
    else:
        folder = f"{_sanitize_folder_name(title)}_{timestamp % 10000}"

    root = _get_user_files_root()
    folder_path = root / folder
    counter = 1
    base_folder = folder
    while folder_path.exists():
        folder = f"{base_folder}_{counter}"
        folder_path = root / folder
        counter += 1

    folder_path.mkdir(parents=True, exist_ok=True)

    session = {
        "id": f"chat_{timestamp}_{folder}",
        "title": title,
        "folder": folder,
        "created_at": time.time(),
        "updated_at": time.time(),
    }
    chats.append(session)
    _save_chats_meta(chats)
    return session

@router.get("/{chat_id}")
async def get_chat(chat_id: str):
    chats = _load_chats_meta()
    session = next((c for c in chats if c["id"] == chat_id), None)
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")

    root = _get_user_files_root()
    history_file = root / session["folder"] / ".history.json"
    history = []
    if history_file.exists():
        try:
            with open(history_file, "r", encoding="utf-8") as f:
                history = json.load(f)
        except Exception:
            history = []

    return {
        "session": session,
        "history": history,
    }

@router.post("/{chat_id}/history")
async def save_chat_history(chat_id: str, req: HistorySaveRequest):
    chats = _load_chats_meta()
    session = next((c for c in chats if c["id"] == chat_id), None)
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")

    root = _get_user_files_root()
    folder_path = root / session["folder"]
    folder_path.mkdir(parents=True, exist_ok=True)
    history_file = folder_path / ".history.json"

    with open(history_file, "w", encoding="utf-8") as f:
        json.dump(req.messages, f, indent=2)

    # Update timestamp
    session["updated_at"] = time.time()
    _save_chats_meta(chats)
    return {"status": "saved", "count": len(req.messages)}

@router.delete("/{chat_id}")
async def delete_chat(chat_id: str):
    chats = _load_chats_meta()
    session = next((c for c in chats if c["id"] == chat_id), None)
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")

    # Don't delete if it's the only chat
    if len(chats) <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete the only remaining chat session")

    chats = [c for c in chats if c["id"] != chat_id]
    _save_chats_meta(chats)

    # Delete folder
    root = _get_user_files_root()
    folder_path = root / session["folder"]
    if folder_path.exists() and folder_path.is_dir():
        try:
            shutil.rmtree(folder_path)
        except Exception:
            pass

    return {"status": "deleted", "id": chat_id}

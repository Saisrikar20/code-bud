import os
import sys
import ast
import json
import time
import asyncio
import subprocess
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from shared.models import FileItem, FileContent, FileSaveRequest
from ..dependencies import get_workspace_dir

router = APIRouter(prefix="/files", tags=["files"])

def build_file_tree(dir_path: str, base_path: str, max_depth: int = 4, current_depth: int = 0) -> List[FileItem]:
    if current_depth > max_depth:
        return []

    items: List[FileItem] = []
    try:
        entries = sorted(os.scandir(dir_path), key=lambda e: (not e.is_dir(), e.name.lower()))
        for entry in entries:
            # Skip heavy or hidden internal dirs
            if entry.name in {".git", ".venv", "__pycache__", "node_modules", ".pytest_cache"}:
                continue

            rel_path = os.path.relpath(entry.path, base_path).replace("\\", "/")
            is_directory = entry.is_dir()

            item = FileItem(
                name=entry.name,
                path=rel_path,
                is_dir=is_directory,
                size=entry.stat().st_size if not is_directory else None,
                children=build_file_tree(entry.path, base_path, max_depth, current_depth + 1) if is_directory else None,
            )
            items.append(item)
    except PermissionError:
        pass
    return items

@router.get("/tree", response_model=List[FileItem])
async def get_tree(workspace: str = Depends(get_workspace_dir)):
    return build_file_tree(workspace, workspace)

@router.get("/content", response_model=FileContent)
async def get_file_content(path: str = Query(..., description="Relative path to file"), workspace: str = Depends(get_workspace_dir)):
    abs_workspace = os.path.abspath(workspace)
    full_path = os.path.normpath(os.path.join(abs_workspace, path))

    try:
        if os.path.commonpath([full_path, abs_workspace]) != abs_workspace:
            raise HTTPException(status_code=403, detail="Access outside workspace forbidden")
    except ValueError:
        raise HTTPException(status_code=403, detail="Invalid path")

    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="File not found")
    if os.path.isdir(full_path):
        raise HTTPException(status_code=400, detail="Cannot read directory content")

    try:
        with open(full_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
        return FileContent(path=path, content=content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/save")
async def save_file(req: FileSaveRequest, workspace: str = Depends(get_workspace_dir)):
    abs_workspace = os.path.abspath(workspace)
    full_path = os.path.normpath(os.path.join(abs_workspace, req.path))

    try:
        if os.path.commonpath([full_path, abs_workspace]) != abs_workspace:
            raise HTTPException(status_code=403, detail="Access outside workspace forbidden")
    except ValueError:
        raise HTTPException(status_code=403, detail="Invalid path")

    try:
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, "w", encoding="utf-8") as f:
            f.write(req.content)
        return {"status": "saved", "path": req.path, "bytes": len(req.content)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/create")
async def create_item(req: dict, workspace: str = Depends(get_workspace_dir)):
    rel_path = req.get("path")
    is_dir = req.get("is_dir", False)
    if not rel_path:
        raise HTTPException(status_code=400, detail="Path is required")
        
    abs_workspace = os.path.abspath(workspace)
    full_path = os.path.normpath(os.path.join(abs_workspace, rel_path))
    
    if os.path.commonpath([full_path, abs_workspace]) != abs_workspace:
        raise HTTPException(status_code=403, detail="Access outside workspace forbidden")
        
    if is_dir:
        os.makedirs(full_path, exist_ok=True)
    else:
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        if not os.path.exists(full_path):
            with open(full_path, "w", encoding="utf-8") as f:
                f.write("")
    return {"status": "created", "path": rel_path, "is_dir": is_dir}

@router.delete("/delete")
async def delete_item(path: str = Query(...), workspace: str = Depends(get_workspace_dir)):
    abs_workspace = os.path.abspath(workspace)
    full_path = os.path.normpath(os.path.join(abs_workspace, path))
    
    if os.path.commonpath([full_path, abs_workspace]) != abs_workspace:
        raise HTTPException(status_code=403, detail="Access outside workspace forbidden")
        
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="File not found")
        
    if os.path.isdir(full_path):
        import shutil
        shutil.rmtree(full_path)
    else:
        os.remove(full_path)
    return {"status": "deleted", "path": path}

def detect_git_branch(path: str) -> str:
    try:
        cur = path
        for _ in range(4):
            head_file = os.path.join(cur, ".git", "HEAD")
            if os.path.isfile(head_file):
                with open(head_file, "r") as f:
                    content = f.read().strip()
                    if content.startswith("ref: refs/heads/"):
                        return content.replace("ref: refs/heads/", "")
                    return content[:7]
            parent = os.path.dirname(cur)
            if parent == cur:
                break
            cur = parent
    except Exception:
        pass
    return "main"

@router.get("/info")
async def get_workspace_info(workspace: str = Depends(get_workspace_dir)):
    return {
        "workspace_root": workspace,
        "name": os.path.basename(workspace).upper(),
        "git_branch": detect_git_branch(workspace),
        "python_version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
    }

@router.post("/validate")
async def validate_code(req: dict):
    path = req.get("path", "")
    content = req.get("content", "")
    ext = os.path.splitext(path)[1].lower()

    if not content.strip():
        return {"valid": True, "errors": 0, "warnings": 0, "details": []}

    if ext == ".py":
        try:
            ast.parse(content, filename=path)
            return {"valid": True, "errors": 0, "warnings": 0, "details": []}
        except SyntaxError as e:
            msg = f"Line {e.lineno}, Col {e.offset or 1}: {e.msg}"
            return {"valid": False, "errors": 1, "warnings": 0, "details": [msg]}
        except Exception as e:
            return {"valid": False, "errors": 1, "warnings": 0, "details": [str(e)]}

    if ext == ".json":
        try:
            json.loads(content)
            return {"valid": True, "errors": 0, "warnings": 0, "details": []}
        except json.JSONDecodeError as e:
            msg = f"Line {e.lineno}, Col {e.colno}: {e.msg}"
            return {"valid": False, "errors": 1, "warnings": 0, "details": [msg]}

    return {"valid": True, "errors": 0, "warnings": 0, "details": []}

@router.post("/run")
async def run_file(req: dict, workspace: str = Depends(get_workspace_dir)):
    rel_path = req.get("path")
    if not rel_path:
        raise HTTPException(status_code=400, detail="Path is required")

    abs_workspace = os.path.abspath(workspace)
    full_path = os.path.normpath(os.path.join(abs_workspace, rel_path))

    try:
        if os.path.commonpath([full_path, abs_workspace]) != abs_workspace:
            raise HTTPException(status_code=403, detail="Access outside workspace forbidden")
    except ValueError:
        raise HTTPException(status_code=403, detail="Invalid path")

    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="File not found")

    start_time = time.time()
    try:
        _, ext = os.path.splitext(full_path)
        if ext.lower() == ".js":
            args = ["node", full_path]
        else:
            # Default to Python unbuffered mode
            args = [sys.executable, "-u", full_path]

        def _execute():
            return subprocess.run(
                args,
                cwd=abs_workspace,
                capture_output=True,
                text=True,
                timeout=30,
                errors="replace",
                stdin=subprocess.DEVNULL,
            )

        res = await asyncio.to_thread(_execute)
        duration = round(time.time() - start_time, 3)
        return {
            "stdout": res.stdout or "",
            "stderr": res.stderr or "",
            "exit_code": res.returncode,
            "duration_seconds": duration,
            "path": rel_path,
        }
    except subprocess.TimeoutExpired:
        return {
            "stdout": "",
            "stderr": "Execution timed out after 30 seconds",
            "exit_code": -1,
            "duration_seconds": 30.0,
            "path": rel_path,
        }
    except Exception as e:
        return {
            "stdout": "",
            "stderr": f"{type(e).__name__}: {str(e)}",
            "exit_code": -1,
            "duration_seconds": 0.0,
            "path": rel_path,
        }

@router.post("/run-terminal")
async def run_in_terminal(req: dict, workspace: str = Depends(get_workspace_dir)):
    rel_path = req.get("path")
    if not rel_path:
        raise HTTPException(status_code=400, detail="Path is required")

    abs_workspace = os.path.abspath(workspace)
    full_path = os.path.normpath(os.path.join(abs_workspace, rel_path))

    try:
        if os.path.commonpath([full_path, abs_workspace]) != abs_workspace:
            raise HTTPException(status_code=403, detail="Access outside workspace forbidden")
    except ValueError:
        raise HTTPException(status_code=403, detail="Invalid path")

    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="File not found")

    try:
        if sys.platform == "win32":
            subprocess.Popen(
                ["cmd.exe", "/c", "start", f"DEVs IDE — {rel_path}", "cmd.exe", "/k", sys.executable, full_path],
                cwd=abs_workspace,
            )
        else:
            subprocess.Popen([sys.executable, full_path], cwd=abs_workspace)
        return {"status": "launched", "path": rel_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


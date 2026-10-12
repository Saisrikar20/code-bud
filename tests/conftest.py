import os
import sys
import tempfile
import shutil
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

# Ensure root and shared packages are on sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
SHARED_DIR = ROOT_DIR / "packages" / "shared" / "src"

if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))
if str(SHARED_DIR) not in sys.path:
    sys.path.insert(0, str(SHARED_DIR))

from agents.context import AgentDeps
from backend.main import app

@pytest.fixture
def temp_workspace():
    """Provides an isolated temporary workspace directory."""
    temp_dir = tempfile.mkdtemp(prefix="codebud_test_ws_")
    yield Path(temp_dir)
    shutil.rmtree(temp_dir, ignore_errors=True)

@pytest.fixture
def test_deps(temp_workspace):
    """Provides an AgentDeps instance tied to temp_workspace."""
    return AgentDeps(workspace_dir=str(temp_workspace), session_id="test_session")

@pytest.fixture
def test_client(temp_workspace, monkeypatch):
    """Provides a FastAPI TestClient with USER_FILES_DIR set to temp_workspace."""
    monkeypatch.setenv("USER_FILES_DIR", str(temp_workspace))
    monkeypatch.setenv("WORKSPACE_DIR", str(temp_workspace))
    client = TestClient(app)
    return client

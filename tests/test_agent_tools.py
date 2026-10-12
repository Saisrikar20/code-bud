import os
import pytest
from unittest.mock import MagicMock
from agents.functions.write import write
from agents.functions.read import read
from agents.functions.edit import edit
from agents.functions.ls import ls
from agents.functions.grep import grep
from agents.functions.find import find
from agents.context import resolve_path, AgentDeps

def make_ctx(deps: AgentDeps):
    """Helper to mock pydantic_ai RunContext."""
    ctx = MagicMock()
    ctx.deps = deps
    return ctx

def test_resolve_path_security(temp_workspace, test_deps):
    ctx = make_ctx(test_deps)
    # Valid relative paths
    res = resolve_path(ctx, "app.py")
    assert res is not None
    target, ws = res
    assert target == os.path.normpath(os.path.join(str(temp_workspace), "app.py"))
    assert ws == os.path.abspath(str(temp_workspace))

    # Valid nested path
    res_nested = resolve_path(ctx, "subdir/module.py")
    assert res_nested is not None

    # Path traversal attempts
    assert resolve_path(ctx, "../outside.txt") is None
    assert resolve_path(ctx, "../../etc/passwd") is None
    assert resolve_path(ctx, "..") is None

def test_write_and_read_file(test_deps):
    ctx = make_ctx(test_deps)

    # 1. Write file
    write_res = write(ctx, "hello.py", "print('Hello, world!')\n")
    assert "Successfully wrote" in write_res
    assert "hello.py" in test_deps.modified_files
    assert any(a.get("action") == "write" for a in test_deps.activities)

    # 2. Read file
    content = read(ctx, "hello.py")
    assert content == "print('Hello, world!')\n"

    # 3. Read with max_chars truncation
    trunc_content = read(ctx, "hello.py", max_chars=5)
    assert trunc_content.startswith("print")
    assert "Warning: Content truncated" in trunc_content

def test_write_nested_directory(test_deps):
    ctx = make_ctx(test_deps)
    res = write(ctx, "src/components/button.py", "class Button:\n    pass\n")
    assert "Successfully wrote" in res
    assert "src/components/button.py" in test_deps.modified_files

    # Verify directory structure was created
    read_res = read(ctx, "src/components/button.py")
    assert "class Button:" in read_res

def test_write_path_traversal_blocked(test_deps):
    ctx = make_ctx(test_deps)
    res = write(ctx, "../escape.py", "malicious code")
    assert "outside" in res.lower() or "error" in res.lower()

def test_read_errors(test_deps):
    ctx = make_ctx(test_deps)
    # Non-existent file
    assert "does not exist" in read(ctx, "missing.py").lower()

    # Path traversal
    assert "outside" in read(ctx, "../outside.py").lower()

    # Reading a directory
    write(ctx, "sub/file.txt", "content")
    assert "is a directory" in read(ctx, "sub").lower()

def test_edit_file(test_deps):
    ctx = make_ctx(test_deps)
    initial = "def calculate():\n    return 41\n"
    write(ctx, "calc.py", initial)

    # Successful edit
    edit_res = edit(ctx, "calc.py", "return 41", "return 42")
    assert "Successfully edited" in edit_res
    assert "+    return 42" in edit_res

    updated = read(ctx, "calc.py")
    assert "return 42" in updated
    assert "return 41" not in updated

def test_edit_errors(test_deps):
    ctx = make_ctx(test_deps)
    write(ctx, "test.txt", "apple\nbanana\napple\n")

    # Identical strings
    assert "identical" in edit(ctx, "test.txt", "apple", "apple").lower()

    # Target not found
    assert "not found" in edit(ctx, "test.txt", "orange", "grape").lower()

    # Multiple matches found
    assert "multiple matches" in edit(ctx, "test.txt", "apple", "peach").lower()

    # Path traversal
    assert "outside" in edit(ctx, "../out.txt", "a", "b").lower()

def test_ls_directory(test_deps):
    ctx = make_ctx(test_deps)
    write(ctx, "file1.txt", "data 1")
    write(ctx, "folder/file2.txt", "data 2")

    res = ls(ctx, ".")
    assert "file1.txt" in res
    assert "folder" in res

    # List subfolder
    sub_res = ls(ctx, "folder")
    assert "file2.txt" in sub_res

    # Non-existent
    assert "does not exist" in ls(ctx, "non_existent_folder").lower()

    # Path traversal
    assert "outside" in ls(ctx, "../").lower()

def test_find_files(test_deps):
    ctx = make_ctx(test_deps)
    write(ctx, "app.py", "x = 1")
    write(ctx, "utils.py", "y = 2")
    write(ctx, "readme.md", "# Readme")
    write(ctx, "nested/helper.py", "z = 3")

    py_files = find(ctx, "*.py")
    assert "app.py" in py_files
    assert "utils.py" in py_files
    assert "nested/helper.py" in py_files
    assert "readme.md" not in py_files

    md_files = find(ctx, "*.md")
    assert "readme.md" in md_files
    assert "app.py" not in md_files

@pytest.mark.asyncio
async def test_grep_files(test_deps):
    ctx = make_ctx(test_deps)
    write(ctx, "service.py", "class AuthService:\n    def login(self):\n        return True\n")
    write(ctx, "test_service.py", "def test_login():\n    assert True\n")
    write(ctx, "config.py", "API_KEY = 'secret'\n")

    matches = await grep(ctx, "def login")
    assert "service.py:2" in matches
    assert "config.py" not in matches

    # Case insensitive grep
    matches_ci = await grep(ctx, "authservice", ignore_case=True)
    assert "service.py" in matches_ci

    # Glob filtering
    matches_glob = await grep(ctx, "True", glob="test_*.py")
    assert "test_service.py:2" in matches_glob
    lines = [l for l in matches_glob.splitlines() if l.startswith("service.py:")]
    assert len(lines) == 0

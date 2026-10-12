import pytest
from fastapi.testclient import TestClient

def test_health_endpoint(test_client: TestClient):
    res = test_client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data.get("status") == "ok"
    assert "version" in data

def test_models_endpoint(test_client: TestClient):
    res = test_client.get("/api/chat/models")
    assert res.status_code == 200
    data = res.json()
    assert "current" in data
    assert "models" in data
    assert isinstance(data["models"], list)

def test_files_crud_and_tree(test_client: TestClient):
    # 1. Create a directory
    res_dir = test_client.post("/api/files/create", json={"path": "src", "is_dir": True})
    assert res_dir.status_code == 200

    # 2. Create a file
    res_file = test_client.post("/api/files/create", json={"path": "src/main.py", "is_dir": False})
    assert res_file.status_code == 200

    # 3. Save content
    save_res = test_client.post("/api/files/save", json={"path": "src/main.py", "content": "print('hello from test')"})
    assert save_res.status_code == 200

    # 4. Read content
    read_res = test_client.get("/api/files/content?path=src/main.py")
    assert read_res.status_code == 200
    assert read_res.json()["content"] == "print('hello from test')"

    # 5. Get file tree
    tree_res = test_client.get("/api/files/tree")
    assert tree_res.status_code == 200
    tree_data = tree_res.json()
    assert any(item["name"] == "src" for item in tree_data)

    # 6. Delete file
    del_res = test_client.delete("/api/files/delete?path=src/main.py")
    assert del_res.status_code == 200

    # 7. Verify deletion
    read_after_del = test_client.get("/api/files/content?path=src/main.py")
    assert read_after_del.status_code == 404

def test_files_path_traversal_protection(test_client: TestClient):
    # Attempting to read outside workspace
    res = test_client.get("/api/files/content?path=../outside.txt")
    assert res.status_code in (400, 403, 404)

    # Attempting to save outside workspace
    res_save = test_client.post("/api/files/save", json={"path": "../../evil.py", "content": "bad"})
    assert res_save.status_code in (400, 403, 404)

    # Attempting to create outside workspace
    res_create = test_client.post("/api/files/create", json={"path": "../evil.py", "is_dir": False})
    assert res_create.status_code in (400, 403, 404)

    # Attempting to delete outside workspace
    res_del = test_client.delete("/api/files/delete?path=../outside.txt")
    assert res_del.status_code in (400, 403, 404)

def test_workspace_info(test_client: TestClient):
    res = test_client.get("/api/files/info")
    assert res.status_code == 200
    data = res.json()
    assert "workspace_root" in data
    assert "name" in data

def test_chats_sessions_lifecycle(test_client: TestClient):
    # 1. List initial chats
    list_res = test_client.get("/api/chats")
    assert list_res.status_code == 200
    initial_chats = list_res.json()
    assert isinstance(initial_chats, list)

    # 2. Create new chat session
    create_res = test_client.post("/api/chats", json={"title": "Calculator App"})
    assert create_res.status_code == 200
    created_chat = create_res.json()
    chat_id = created_chat["id"]
    assert created_chat["title"] == "Calculator App"
    assert "folder" in created_chat

    # 3. Get chat details
    detail_res = test_client.get(f"/api/chats/{chat_id}")
    assert detail_res.status_code == 200
    detail_data = detail_res.json()
    assert detail_data["session"]["id"] == chat_id

    # 4. Save history with token usage
    history_payload = {
        "messages": [
            {"role": "user", "content": "Build calculator"},
            {
                "role": "assistant",
                "content": "Done building calculator",
                "usage": {
                    "input_tokens": 120,
                    "output_tokens": 45,
                    "total_tokens": 165,
                    "requests": 1,
                },
            },
        ]
    }
    hist_res = test_client.post(f"/api/chats/{chat_id}/history", json=history_payload)
    assert hist_res.status_code == 200

    # 5. Verify history and token usage were stored
    detail_res2 = test_client.get(f"/api/chats/{chat_id}")
    assert detail_res2.status_code == 200
    stored_history = detail_res2.json()["history"]
    assert len(stored_history) == 2
    assert stored_history[1]["usage"]["total_tokens"] == 165

    # 6. Delete chat session
    del_res = test_client.delete(f"/api/chats/{chat_id}")
    assert del_res.status_code == 200

    # 7. Verify deletion
    detail_res3 = test_client.get(f"/api/chats/{chat_id}")
    assert detail_res3.status_code == 404

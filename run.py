import uvicorn
import os
import sys

# Ensure packages and root are on sys.path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(BASE_DIR, "packages", "shared", "src"))
sys.path.insert(0, BASE_DIR)

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "127.0.0.1")
    print(f"[*] Starting Code-Bud Antigravity IDE on http://{host}:{port}")
    uvicorn.run("backend.main:app", host=host, port=port, reload=False)

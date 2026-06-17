# GrammarBuddy Backend

Python FastAPI service that integrates with Alibaba Cloud DashScope (Qwen API, Beijing region).

## Configuration

```powershell
cd backend
copy .env.example .env
# Edit .env and set DASHSCOPE_API_KEY
```

## Run

```powershell
cd backend
py -3 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Use `--host 0.0.0.0` so the StopWatch and other devices on your LAN can reach the server (not only `127.0.0.1`).

## Endpoints

- `GET /health` — Health check
- `GET /api/lessons` — Grammar lesson list
- `WS /ws/session` — Session WebSocket

# GrammarBuddy Backend

Python FastAPI 服务，对接阿里云百炼（国内北京）千问 API。

## 配置

```powershell
cd backend
copy .env.example .env
# 编辑 .env，填入 DASHSCOPE_API_KEY
```

## 启动

```powershell
cd backend
py -3 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## 接口

- `GET /health` — 健康检查
- `GET /api/lessons` — 语法主题列表
- `WS /ws/session` — 会话 WebSocket

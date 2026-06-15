import logging

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from app.config import get_settings
from app.services.lesson_loader import list_lessons, load_lessons
from app.services.news_history import list_practice_summaries, load_practice_record
from app.version_info import get_version_payload
from app.ws.router import router as ws_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

settings = get_settings()

app = FastAPI(title="GrammarBuddy API", version="0.4.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ws_router)


@app.on_event("startup")
async def startup() -> None:
    lessons = load_lessons()
    logger.info("Loaded %d lesson templates", len(lessons))


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.get("/api/version")
async def api_version() -> dict:
    return get_version_payload()


@app.get("/api/lessons")
async def get_lessons() -> dict:
    return {"lessons": [l.model_dump() for l in list_lessons()]}


@app.get("/api/news/history")
async def get_news_history() -> dict:
    return {"sessions": list_practice_summaries()}


@app.get("/api/news/history/{session_id}")
async def get_news_history_detail(session_id: str) -> dict:
    record = load_practice_record(session_id)
    if not record:
        raise HTTPException(status_code=404, detail="Practice record not found")
    return record


_ALLOWED_TTS_HOSTS = (
    "dashscope-result-bj.oss-cn-beijing.aliyuncs.com",
    "dashscope-result-sh.oss-cn-shanghai.aliyuncs.com",
)


@app.get("/api/tts/proxy")
async def proxy_tts_audio(url: str = Query(..., min_length=8)) -> Response:
    """Proxy DashScope TTS audio so the browser can fetch without CORS issues."""
    from urllib.parse import urlparse

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or parsed.hostname not in _ALLOWED_TTS_HOSTS:
        raise HTTPException(status_code=400, detail="Invalid TTS audio URL")

    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()

    content_type = resp.headers.get("content-type") or "audio/wav"
    return Response(content=resp.content, media_type=content_type)

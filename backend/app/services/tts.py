import asyncio
import base64
import logging
from dataclasses import dataclass

import dashscope
import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)


@dataclass
class TtsResult:
    format: str
    data_base64: str | None = None
    url: str | None = None


def _synthesize_sync(text: str) -> TtsResult:
    settings = get_settings()
    dashscope.base_http_api_url = settings.dashscope_http_api_url

    response = dashscope.MultiModalConversation.call(
        model=settings.qwen_tts_model,
        api_key=settings.dashscope_api_key,
        text=text,
        voice=settings.qwen_tts_voice,
        language_type=settings.qwen_tts_language,
        stream=False,
    )

    if response.status_code != 200:
        raise RuntimeError(
            f"TTS failed: {response.code} {response.message}"
        )

    audio = response.output.audio
    audio_format = "wav"
    if audio.url:
        lower = audio.url.lower()
        if ".mp3" in lower:
            audio_format = "mp3"
        elif ".ogg" in lower:
            audio_format = "ogg"
        return TtsResult(format=audio_format, url=audio.url)

    if audio.data:
        return TtsResult(format=audio_format, data_base64=audio.data)

    raise RuntimeError("TTS returned no audio data")


async def synthesize(text: str) -> TtsResult:
    if not text.strip():
        raise ValueError("TTS text is empty")
    return await asyncio.to_thread(_synthesize_sync, text.strip())


async def fetch_audio_as_base64(url: str) -> tuple[str, str]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        content_type = (resp.headers.get("content-type") or "").lower()
        if "mpeg" in content_type or "mp3" in content_type:
            fmt = "mp3"
        elif "ogg" in content_type:
            fmt = "ogg"
        else:
            fmt = "wav"
        return base64.b64encode(resp.content).decode("ascii"), fmt


async def resolve_for_client(result: TtsResult) -> TtsResult:
    """Download OSS audio on the server and inline as base64 for reliable browser playback."""
    if result.data_base64:
        return result
    if not result.url:
        raise RuntimeError("TTS returned no audio")
    data_b64, fmt = await fetch_audio_as_base64(result.url)
    return TtsResult(format=fmt, data_base64=data_b64)

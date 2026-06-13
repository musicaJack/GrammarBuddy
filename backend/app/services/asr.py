import asyncio
import logging
from typing import Any

import dashscope

from app.config import get_settings

logger = logging.getLogger(__name__)


def _extract_text(content: Any) -> str:
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                text = item.get("text") or item.get("transcript")
                if text:
                    parts.append(str(text))
        return " ".join(parts).strip()
    if isinstance(content, dict):
        text = content.get("text") or content.get("transcript")
        return str(text).strip() if text else ""
    return ""


def _transcribe_sync(audio_data_url: str) -> str:
    settings = get_settings()
    if not settings.dashscope_api_key:
        raise RuntimeError("DASHSCOPE_API_KEY is not configured")

    dashscope.base_http_api_url = settings.dashscope_http_api_url

    response = dashscope.MultiModalConversation.call(
        model=settings.qwen_asr_model,
        api_key=settings.dashscope_api_key,
        messages=[{"role": "user", "content": [{"audio": audio_data_url}]}],
        result_format="message",
        asr_options={
            "language": settings.qwen_asr_language,
            "enable_itn": False,
        },
    )

    if response.status_code != 200:
        raise RuntimeError(f"ASR failed: {response.code} {response.message}")

    output = response.output
    choices = getattr(output, "choices", None) or []
    if not choices:
        raise RuntimeError("ASR returned no choices")

    message = choices[0].message
    text = _extract_text(getattr(message, "content", ""))
    if not text:
        raise RuntimeError("ASR returned empty transcript")
    return text


async def transcribe_data_url(audio_data_url: str, *, retries: int = 3) -> str:
    if not audio_data_url.strip():
        raise ValueError("Audio data URL is empty")

    last_error: Exception | None = None
    for attempt in range(retries):
        try:
            return await asyncio.to_thread(_transcribe_sync, audio_data_url.strip())
        except RuntimeError as exc:
            last_error = exc
            message = str(exc)
            retryable = (
                "InternalError" in message
                or "empty transcript" in message.lower()
                or "timeout" in message.lower()
            )
            if retryable and attempt < retries - 1:
                wait = 0.6 * (attempt + 1)
                logger.warning("ASR attempt %d failed, retry in %.1fs: %s", attempt + 1, wait, exc)
                await asyncio.sleep(wait)
                continue
            raise
    if last_error:
        raise last_error
    raise RuntimeError("ASR failed")

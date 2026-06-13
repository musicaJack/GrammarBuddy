import asyncio
import logging

from fastapi import WebSocket

from app.config import get_settings
from app.schemas.messages import WSMessage
from app.services.news_text import word_count
from app.services.tts import resolve_for_client, synthesize
from app.session.manager import SessionState
from app.ws.messaging import send_message

logger = logging.getLogger(__name__)


def build_tts_payload(
    *,
    field: str,
    entry_id: str,
    segment_text: str,
    tts_result,
    segment_index: int | None = None,
    segment_total: int | None = None,
    word_offset: int = 0,
) -> dict:
    payload: dict = {
        "field": field,
        "format": tts_result.format,
        "entry_id": entry_id,
        "text": segment_text,
        "segment_text": segment_text,
    }
    if segment_index is not None and segment_total is not None:
        payload["segment_index"] = segment_index
        payload["segment_total"] = segment_total
        payload["word_offset"] = word_offset
        payload["is_last_segment"] = segment_index >= segment_total - 1
    if tts_result.data_base64:
        payload["data_base64"] = tts_result.data_base64
    elif tts_result.url:
        payload["url"] = tts_result.url
    else:
        raise RuntimeError("TTS returned no audio")
    return payload


async def stream_tts_segments(
    ws: WebSocket,
    session: SessionState,
    *,
    segments: list[str],
    field: str,
    entry_id: str,
) -> None:
    """Kick off all segment syntheses at once; push audio in order as each completes."""
    if not segments:
        return

    settings = get_settings()
    sem = asyncio.Semaphore(settings.tts_max_concurrent)
    total = len(segments)
    offsets: list[int] = []
    offset = 0
    for seg in segments:
        offsets.append(offset)
        offset += word_count(seg)

    async def _synth(segment: str):
        async with sem:
            if session.paused:
                raise asyncio.CancelledError()
            return await synthesize(segment)

    tasks = [asyncio.create_task(_synth(seg)) for seg in segments]

    for index, task in enumerate(tasks):
        if session.paused:
            for pending in tasks[index:]:
                pending.cancel()
            return
        try:
            result = await task
            result = await resolve_for_client(result)
        except Exception:
            logger.exception(
                "News TTS segment failed field=%s entry=%s index=%d",
                field,
                entry_id,
                index,
            )
            await send_message(
                ws,
                WSMessage(
                    type="tts",
                    session_id=session.session_id,
                    payload={
                        "field": field,
                        "format": "text_fallback",
                        "text": segments[index],
                        "segment_text": segments[index],
                        "entry_id": entry_id,
                        "segment_index": index,
                        "segment_total": total,
                        "word_offset": offsets[index],
                        "is_last_segment": index >= total - 1,
                    },
                ),
            )
            continue

        payload = build_tts_payload(
            field=field,
            entry_id=entry_id,
            segment_text=segments[index],
            tts_result=result,
            segment_index=index,
            segment_total=total,
            word_offset=offsets[index],
        )
        await send_message(
            ws,
            WSMessage(
                type="tts",
                session_id=session.session_id,
                payload=payload,
            ),
        )
        logger.info(
            "News TTS segment field=%s entry=%s %d/%d via=%s",
            field,
            entry_id,
            index + 1,
            total,
            "base64" if payload.get("data_base64") else "url",
        )

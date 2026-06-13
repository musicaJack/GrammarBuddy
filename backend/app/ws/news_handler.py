import logging
import uuid

from fastapi import WebSocket

from app.config import get_settings
from app.schemas.messages import WSMessage
from app.services.asr import transcribe_data_url
from app.services.news_chat import (
    dialogue_turn,
    generate_broadcast_script,
    generate_opening_question,
    generate_wrap_up,
)
from app.services.news_fetch import fetch_random_article
from app.services.news_text import split_paragraphs
from app.services.tts import resolve_for_client, synthesize
from app.services.tts_segments import build_tts_payload, stream_tts_segments
from app.session.manager import SessionState, session_manager
from app.session.state import ActivityType, NewsPhase
from app.ws.messaging import send_error, send_message, send_phase_complete

logger = logging.getLogger(__name__)


async def send_news_phase(ws: WebSocket, session: SessionState) -> None:
    await send_message(
        ws,
        WSMessage(
            type="control",
            session_id=session.session_id,
            payload={
                "action": "phase_changed",
                "phase": session.news_phase.value,
                "turn_count": session.turn_count,
                "min_turns": session.min_turns,
                "paused": session.paused,
            },
        ),
    )


async def append_transcript(
    ws: WebSocket,
    session: SessionState,
    *,
    role: str,
    text: str,
    phase: str,
    turn: int = 0,
) -> str:
    entry_id = str(uuid.uuid4())
    entry = {
        "id": entry_id,
        "role": role,
        "text": text,
        "phase": phase,
        "turn": turn,
    }
    session.transcript.append(entry)
    await send_message(
        ws,
        WSMessage(
            type="control",
            session_id=session.session_id,
            payload={"action": "transcript_append", "entry": entry},
        ),
    )
    return entry_id


async def send_tts_with_transcript(
    ws: WebSocket,
    session: SessionState,
    text: str,
    field: str,
    *,
    phase: str,
    turn: int = 0,
) -> None:
    if not text.strip():
        return
    entry_id = await append_transcript(
        ws, session, role="assistant", text=text, phase=phase, turn=turn
    )
    await send_message(
        ws,
        WSMessage(
            type="control",
            session_id=session.session_id,
            payload={"action": "transcript_speaking", "entry_id": entry_id},
        ),
    )

    settings = get_settings()
    segments = split_paragraphs(text, max_words=settings.tts_segment_max_words)

    try:
        if len(segments) <= 1:
            tts_result = await resolve_for_client(await synthesize(text))
            payload = build_tts_payload(
                field=field,
                entry_id=entry_id,
                segment_text=text,
                tts_result=tts_result,
                segment_index=0,
                segment_total=1,
                word_offset=0,
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
                "News TTS sent field=%s entry=%s via=%s",
                field,
                entry_id,
                "url" if payload.get("url") else "base64",
            )
            return

        await stream_tts_segments(
            ws,
            session,
            segments=segments,
            field=field,
            entry_id=entry_id,
        )
    except Exception as exc:
        logger.exception("News TTS failed")
        await send_message(
            ws,
            WSMessage(
                type="tts",
                session_id=session.session_id,
                payload={
                    "field": field,
                    "format": "text_fallback",
                    "text": text,
                    "segment_text": text,
                    "entry_id": entry_id,
                    "segment_index": 0,
                    "segment_total": 1,
                    "word_offset": 0,
                    "is_last_segment": True,
                    "error": str(exc),
                },
            ),
        )


async def send_news_ui(ws: WebSocket, session: SessionState, ui_state: str) -> None:
    await send_message(
        ws,
        WSMessage(
            type="control",
            session_id=session.session_id,
            payload={
                "action": "ui_state",
                "ui_state": ui_state,
                "phase": session.news_phase.value,
                "turn_count": session.turn_count,
                "min_turns": session.min_turns,
                "paused": session.paused,
            },
        ),
    )


async def start_news_session(ws: WebSocket, grade: int) -> None:
    session = session_manager.create_news(grade=grade)
    await send_message(
        ws,
        WSMessage(
            type="control",
            session_id=session.session_id,
            payload={
                "action": "session_started",
                "session_id": session.session_id,
                "activity_type": ActivityType.NEWS.value,
                "turn_count": 0,
                "min_turns": session.min_turns,
            },
        ),
    )
    await run_fetch_phase(ws, session)


async def run_fetch_phase(ws: WebSocket, session: SessionState) -> None:
    if session.paused:
        return
    session.news_phase = NewsPhase.FETCH
    await send_news_ui(ws, session, "FETCHING")
    await send_news_phase(ws, session)

    try:
        article = await fetch_random_article()
    except Exception as exc:
        logger.exception("News fetch failed")
        await send_error(ws, f"Could not fetch news: {exc}", session.session_id)
        return

    session.article = article
    await send_message(
        ws,
        WSMessage(
            type="control",
            session_id=session.session_id,
            payload={
                "action": "news_ready",
                "article": article.model_dump(),
            },
        ),
    )
    await run_broadcast_phase(ws, session)


async def send_news_segment_gate(
    ws: WebSocket, session: SessionState, next_step: str
) -> None:
    """Wait for client playback to finish before synthesizing the next segment."""
    session.news_pending_step = next_step
    await send_message(
        ws,
        WSMessage(
            type="control",
            session_id=session.session_id,
            payload={
                "action": "phase_complete",
                "next": "continue_news",
                "news_step": next_step,
            },
        ),
    )


async def run_broadcast_phase(ws: WebSocket, session: SessionState) -> None:
    if session.paused or not session.article:
        return
    session.news_phase = NewsPhase.BROADCAST
    await send_news_ui(ws, session, "BROADCAST")
    await send_news_phase(ws, session)

    article = session.article
    script = await generate_broadcast_script(article, session.grade)
    session.chat_messages.append({"role": "assistant", "content": script})
    await send_tts_with_transcript(
        ws, session, script, "news_broadcast", phase="broadcast"
    )
    await send_news_segment_gate(ws, session, "open_question")


async def run_open_question_phase(ws: WebSocket, session: SessionState) -> None:
    if session.paused or not session.article:
        return
    session.news_phase = NewsPhase.OPEN_QUESTION
    await send_news_ui(ws, session, "OPEN_QUESTION")
    await send_news_phase(ws, session)

    question = await generate_opening_question(session.article, session.grade)
    session.chat_messages.append({"role": "assistant", "content": question})
    await send_tts_with_transcript(
        ws, session, question, "opening_question", phase="open_question"
    )
    await begin_dialogue_listening(ws, session)


async def begin_dialogue_listening(ws: WebSocket, session: SessionState) -> None:
    if session.paused:
        return
    session.news_phase = NewsPhase.DIALOGUE
    await send_news_phase(ws, session)
    # Mic opens on client only after TTS queue drains (phase_complete → listen).
    await send_phase_complete(ws, session)


async def run_wrap_up_phase(ws: WebSocket, session: SessionState) -> None:
    if not session.article:
        return
    session.news_phase = NewsPhase.WRAP_UP
    await send_news_ui(ws, session, "WRAP_UP")
    await send_news_phase(ws, session)

    lines = [
        f"{'AI' if e['role'] == 'assistant' else 'Student'}: {e['text']}"
        for e in session.transcript
    ]
    wrap = await generate_wrap_up(
        article=session.article,
        grade=session.grade,
        transcript_lines=lines,
    )
    spoken = f"Great work today! {wrap.topic_summary} {wrap.overall_feedback}".strip()
    await send_message(
        ws,
        WSMessage(
            type="gpt",
            session_id=session.session_id,
            payload={"ui_state": "WRAP_UP", "wrap_up": wrap.model_dump()},
        ),
    )
    await send_tts_with_transcript(
        ws, session, spoken, "wrap_up", phase="wrap_up", turn=session.turn_count
    )
    session.news_phase = NewsPhase.COMPLETE
    await send_news_ui(ws, session, "COMPLETE")
    await send_news_phase(ws, session)


async def handle_news_asr(ws: WebSocket, session: SessionState, payload: dict) -> None:
    if session.paused:
        return

    text = (payload.get("text") or "").strip()
    audio_base64 = (payload.get("audio_base64") or "").strip()

    if not text and audio_base64:
        try:
            audio_data_url = audio_base64
            if not audio_base64.startswith("data:"):
                fmt = payload.get("format") or "webm"
                audio_data_url = f"data:audio/{fmt};base64,{audio_base64}"
            text = await transcribe_data_url(audio_data_url)
        except Exception as exc:
            logger.exception("News ASR failed")
            await send_error(ws, f"Speech recognition failed: {exc}", session.session_id)
            await send_news_ui(ws, session, "LISTENING")
            return

    if not text:
        await send_error(ws, "Empty speech text", session.session_id)
        await send_news_ui(ws, session, "LISTENING")
        return

    await send_message(
        ws,
        WSMessage(
            type="control",
            session_id=session.session_id,
            payload={"action": "asr_transcript", "text": text},
        ),
    )
    await append_transcript(
        ws,
        session,
        role="user",
        text=text,
        phase="dialogue",
        turn=session.turn_count + 1,
    )
    session.chat_messages.append({"role": "user", "content": text})
    session.turn_count += 1

    await send_news_ui(ws, session, "THINKING")
    await send_news_phase(ws, session)

    if not session.article:
        await send_error(ws, "News article missing", session.session_id)
        return

    try:
        result = await dialogue_turn(
            article=session.article,
            grade=session.grade,
            phase=session.news_phase,
            turn_count=session.turn_count,
            min_turns=session.min_turns,
            messages=session.chat_messages,
            user_text=text,
        )
    except Exception as exc:
        logger.exception("News dialogue failed")
        await send_error(ws, f"Dialogue failed: {exc}", session.session_id)
        await begin_dialogue_listening(ws, session)
        return

    reply = result.assistant_text
    if result.light_grammar_note:
        reply = f"{reply} ({result.light_grammar_note})"

    session.chat_messages.append({"role": "assistant", "content": reply})
    await send_tts_with_transcript(
        ws,
        session,
        reply,
        "dialogue_reply",
        phase="dialogue",
        turn=session.turn_count,
    )

    if result.phase == "wrap_up" and session.turn_count >= session.min_turns:
        await run_wrap_up_phase(ws, session)
    else:
        await begin_dialogue_listening(ws, session)


async def handle_news_control(
    ws: WebSocket, session: SessionState, action: str, payload: dict
) -> None:
    if action == "continue_news":
        if session.paused:
            return
        step = str(payload.get("news_step") or session.news_pending_step or "")
        session.news_pending_step = ""
        if step == "open_question" and session.news_phase == NewsPhase.BROADCAST:
            await run_open_question_phase(ws, session)
        return

    if action == "start_listening":
        if session.news_phase == NewsPhase.DIALOGUE:
            await send_news_ui(ws, session, "LISTENING")
        return

    if action == "pause_session":
        session.paused = True
        session.resume_phase = session.news_phase
        session.news_pending_step = ""
        await send_news_ui(ws, session, "PAUSED")
        await send_news_phase(ws, session)
        return

    if action == "resume_session":
        if not session.paused:
            return
        session.paused = False
        phase = session.resume_phase or session.news_phase
        session.resume_phase = None
        if phase == NewsPhase.FETCH:
            await run_fetch_phase(ws, session)
        elif phase == NewsPhase.BROADCAST:
            await send_news_ui(ws, session, "BROADCAST")
            await send_news_phase(ws, session)
        elif phase == NewsPhase.OPEN_QUESTION:
            await send_news_ui(ws, session, "OPEN_QUESTION")
            await send_news_phase(ws, session)
        elif phase == NewsPhase.DIALOGUE:
            await begin_dialogue_listening(ws, session)
        elif phase == NewsPhase.WRAP_UP:
            await run_wrap_up_phase(ws, session)
        else:
            await send_news_ui(ws, session, "LISTENING")
        return

    if action == "stop_session":
        session_manager.delete(session.session_id)
        await send_message(
            ws,
            WSMessage(
                type="control",
                session_id=session.session_id,
                payload={"action": "session_stopped"},
            ),
        )

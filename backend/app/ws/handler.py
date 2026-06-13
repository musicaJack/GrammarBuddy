import logging
from typing import Any

from fastapi import WebSocket

from app.schemas.gpt_response import GrammarResponse
from app.schemas.lesson import LessonCustom
from app.schemas.messages import WSMessage
from app.services.asr import transcribe_data_url
from app.services.grammar_qwen import evaluate_sentence
from app.services.lesson_loader import resolve_lesson
from app.services.repeat_match import repeat_matches
from app.services.tts import fetch_audio_as_base64, synthesize
from app.session.manager import SessionState, session_manager
from app.session.questions import QUESTIONS_PER_SCENARIO
from app.session.state import ActivityType, SessionMode, UIState
from app.ws.messaging import (
    send_await_continue,
    send_error,
    send_message,
    send_phase_complete,
    send_ui_state,
)

logger = logging.getLogger(__name__)


async def send_grammar_response(
    ws: WebSocket, session: SessionState, result: GrammarResponse
) -> None:
    await send_message(
        ws,
        WSMessage(
            type="gpt",
            session_id=session.session_id,
            payload=result.model_dump(mode="json"),
        ),
    )


async def send_tts_for_text(
    ws: WebSocket,
    session: SessionState,
    text: str,
    field: str,
) -> None:
    if not text.strip():
        return
    try:
        tts_result = await synthesize(text)
        data_b64 = tts_result.data_base64
        audio_format = tts_result.format
        if not data_b64 and tts_result.url:
            data_b64, audio_format = await fetch_audio_as_base64(tts_result.url)
        await send_message(
            ws,
            WSMessage(
                type="tts",
                session_id=session.session_id,
                payload={
                    "field": field,
                    "format": audio_format,
                    "data_base64": data_b64,
                    "url": tts_result.url,
                },
            ),
        )
    except Exception as exc:
        logger.exception("TTS failed for field %s", field)
        await send_message(
            ws,
            WSMessage(
                type="tts",
                session_id=session.session_id,
                payload={
                    "field": field,
                    "format": "text_fallback",
                    "text": text,
                    "error": str(exc),
                },
            ),
        )


async def ask_question(ws: WebSocket, session: SessionState) -> None:
    session.ui_state = UIState.ASKING
    round_number = min(session.rounds_completed + 1, session.total_rounds)
    await send_message(
        ws,
        WSMessage(
            type="control",
            session_id=session.session_id,
            payload={
                "action": "ask_question",
                "ui_state": UIState.ASKING.value,
                "current_question": session.current_question,
                "round_number": round_number,
                "total_rounds": session.total_rounds,
            },
        ),
    )
    if session.current_question:
        await send_tts_for_text(ws, session, session.current_question, "question")
    await send_phase_complete(ws, session)


async def enter_practice_phase(ws: WebSocket, session: SessionState) -> None:
    session.ui_state = UIState.PRACTICE
    session.mode = SessionMode.REPEAT_CHECK
    if session.target_sentence:
        await send_tts_for_text(
            ws, session, session.target_sentence, "practice_sentence"
        )
    prompt = "Repeat after me!"
    if session.last_response and session.last_response.tts.repeat_prompt:
        prompt = session.last_response.tts.repeat_prompt
    await send_tts_for_text(ws, session, prompt, "repeat_prompt")
    await send_ui_state(ws, session)
    await send_phase_complete(ws, session)


async def send_scenario_complete(ws: WebSocket, session: SessionState) -> None:
    session.ui_state = UIState.SCENARIO_COMPLETE
    await send_message(
        ws,
        WSMessage(
            type="control",
            session_id=session.session_id,
            payload={
                "action": "scenario_complete",
                "ui_state": UIState.SCENARIO_COMPLETE.value,
                "round_number": session.total_rounds,
                "total_rounds": session.total_rounds,
                "lesson": {
                    "id": session.lesson.id,
                    "display_name": session.lesson.display_name,
                    "display_name_en": session.lesson.display_name_en,
                },
            },
        ),
    )
    msg = (
        f"Great job! You finished all {session.total_rounds} questions "
        f"for {session.lesson.display_name_en}."
    )
    await send_tts_for_text(ws, session, msg, "scenario_complete")


async def start_next_round(ws: WebSocket, session: SessionState) -> None:
    if session.rounds_completed >= session.total_rounds:
        await send_scenario_complete(ws, session)
        return

    session.mode = SessionMode.GRAMMAR_PRACTICE
    session.attempt = 1
    session.current_question = session.scenario_questions[session.rounds_completed]
    await ask_question(ws, session)


def _finalize_grammar_practice_result(result: GrammarResponse) -> GrammarResponse:
    action = (result.next_step.action or "").upper()
    if action == "NEXT":
        result.ui_state = UIState.PRACTICE_SUCCESS
        result.evaluation.is_correct = True
        return result
    if result.evaluation.is_correct and result.ui_state == UIState.PRACTICE:
        result.ui_state = UIState.PRACTICE_SUCCESS
        return result
    if result.evaluation.is_correct and result.ui_state == UIState.PRACTICE_SUCCESS:
        return result
    return result


def _finalize_repeat_check_result(
    user_text: str,
    target_sentence: str,
    result: GrammarResponse,
) -> GrammarResponse:
    if repeat_matches(user_text, target_sentence):
        result.ui_state = UIState.PRACTICE_SUCCESS
        result.evaluation.is_correct = True
        return result

    if result.ui_state == UIState.PRACTICE_SUCCESS or (
        result.evaluation.is_correct and result.ui_state != UIState.FEEDBACK
    ):
        result.ui_state = UIState.PRACTICE_SUCCESS
        result.evaluation.is_correct = True
        return result

    if result.ui_state == UIState.PRACTICE:
        result.ui_state = UIState.FEEDBACK
    return result


def _apply_grammar_result(
    session: SessionState,
    result: GrammarResponse,
    *,
    user_text: str = "",
) -> None:
    session.last_response = result
    session.ui_state = result.ui_state
    if result.correction and result.correction.correct_sentence:
        session.target_sentence = result.correction.correct_sentence
    if result.ui_state == UIState.PRACTICE:
        session.mode = SessionMode.REPEAT_CHECK
        if not session.target_sentence and user_text.strip():
            session.target_sentence = user_text.strip()
    elif result.ui_state == UIState.PRACTICE_SUCCESS:
        session.mode = SessionMode.GRAMMAR_PRACTICE
        session.rounds_completed += 1
        session.attempt = 1
    elif result.ui_state == UIState.FEEDBACK:
        session.mode = SessionMode.GRAMMAR_PRACTICE


async def _after_grammar_tts(ws: WebSocket, session: SessionState) -> None:
    state = session.ui_state
    result = session.last_response
    if state == UIState.FEEDBACK and result:
        if result.tts.primary:
            await send_tts_for_text(ws, session, result.tts.primary, "primary")
        await send_await_continue(ws, session)
    elif state == UIState.PRACTICE and result:
        if result.tts.primary:
            await send_tts_for_text(ws, session, result.tts.primary, "primary")
        if session.target_sentence:
            await send_tts_for_text(
                ws, session, session.target_sentence, "practice_sentence"
            )
        prompt = "Repeat after me!"
        if result.tts.repeat_prompt:
            prompt = result.tts.repeat_prompt
        await send_tts_for_text(ws, session, prompt, "repeat_prompt")
        await send_ui_state(ws, session)
        await send_phase_complete(ws, session)
    elif state == UIState.PRACTICE_SUCCESS and result:
        if result.tts.primary:
            await send_tts_for_text(ws, session, result.tts.primary, "primary")
        await start_next_round(ws, session)
    elif result and result.tts.primary:
        await send_tts_for_text(ws, session, result.tts.primary, "primary")
        await send_phase_complete(ws, session)


async def handle_control(ws: WebSocket, payload: dict[str, Any]) -> None:
    action = payload.get("action")

    if action == "start_session":
        activity_type = str(payload.get("activity_type") or "grammar")
        grade = int(payload.get("grade", 3))

        if activity_type == ActivityType.NEWS.value:
            from app.ws.news_handler import start_news_session

            await start_news_session(ws, grade)
            return

        lesson_id = payload.get("lesson_id")
        lesson_custom = None
        if raw_custom := payload.get("lesson_custom"):
            lesson_custom = LessonCustom.model_validate(raw_custom)

        try:
            lesson = resolve_lesson(lesson_id, lesson_custom)
        except ValueError as exc:
            await send_error(ws, str(exc))
            return

        session = session_manager.create(lesson, grade=grade)
        await send_message(
            ws,
            WSMessage(
                type="control",
                session_id=session.session_id,
                payload={
                    "action": "session_started",
                    "session_id": session.session_id,
                    "activity_type": ActivityType.GRAMMAR.value,
                    "lesson": {
                        "id": lesson.id,
                        "display_name": lesson.display_name,
                        "display_name_en": lesson.display_name_en,
                    },
                    "current_question": session.current_question,
                    "round_number": 1,
                    "total_rounds": session.total_rounds,
                },
            ),
        )
        await ask_question(ws, session)
        return

    session_id = payload.get("session_id")
    if not session_id:
        await send_error(ws, "session_id required")
        return

    session = session_manager.get(session_id)
    if not session:
        await send_error(ws, "Session not found", session_id)
        return

    if session.activity_type == ActivityType.NEWS:
        from app.ws.news_handler import handle_news_control

        await handle_news_control(ws, session, str(action), payload)
        return

    if action == "start_listening":
        session.ui_state = UIState.LISTENING
        logger.info("Session %s: start_listening", session_id)
        await send_ui_state(ws, session)
        return

    if action == "continue_after_feedback":
        if session.ui_state != UIState.FEEDBACK:
            await send_error(ws, "Not on feedback screen", session_id)
            return
        logger.info("Session %s: continue_after_feedback", session_id)
        await enter_practice_phase(ws, session)
        return

    if action == "stop_session":
        session_manager.delete(session_id)
        await send_message(
            ws,
            WSMessage(
                type="control",
                session_id=session_id,
                payload={"action": "session_stopped"},
            ),
        )
        return

    if action == "switch_lesson":
        lesson_id = payload.get("lesson_id")
        if not lesson_id:
            await send_error(ws, "lesson_id required", session_id)
            return
        try:
            lesson = resolve_lesson(str(lesson_id), None)
        except ValueError as exc:
            await send_error(ws, str(exc), session_id)
            return

        session_manager.delete(session_id)
        new_session = session_manager.create(lesson, grade=session.grade)
        await send_message(
            ws,
            WSMessage(
                type="control",
                session_id=new_session.session_id,
                payload={
                    "action": "session_started",
                    "session_id": new_session.session_id,
                    "lesson": {
                        "id": lesson.id,
                        "display_name": lesson.display_name,
                        "display_name_en": lesson.display_name_en,
                    },
                    "current_question": new_session.current_question,
                    "round_number": 1,
                    "total_rounds": new_session.total_rounds,
                },
            ),
        )
        await ask_question(ws, new_session)
        return

    await send_error(ws, f"Unknown control action: {action}", session_id)


async def handle_asr(ws: WebSocket, payload: dict[str, Any]) -> None:
    session_id = payload.get("session_id")
    if not session_id:
        await send_error(ws, "session_id required")
        return

    session = session_manager.get(session_id)
    if not session:
        await send_error(ws, "Session not found", session_id)
        return

    if session.activity_type == ActivityType.NEWS:
        from app.ws.news_handler import handle_news_asr

        await handle_news_asr(ws, session, payload)
        return

    if payload.get("action") != "asr_final":
        await send_error(ws, "Unsupported asr action", session_id)
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
            logger.info("Session %s: asr transcribed %r", session_id, text)
        except Exception as exc:
            logger.exception("ASR transcription failed")
            session.ui_state = UIState.LISTENING
            await send_error(ws, f"Speech recognition failed: {exc}", session_id)
            await send_ui_state(ws, session)
            return

    if not text:
        session.ui_state = UIState.LISTENING
        await send_error(ws, "Empty speech text", session_id)
        await send_ui_state(ws, session)
        return

    logger.info("Session %s: asr_final %r", session_id, text)

    await send_message(
        ws,
        WSMessage(
            type="control",
            session_id=session_id,
            payload={"action": "asr_transcript", "text": text},
        ),
    )

    session.ui_state = UIState.THINKING
    await send_ui_state(ws, session)

    try:
        result = await evaluate_sentence(
            user_text=text,
            lesson=session.lesson,  # type: ignore[arg-type]
            grade=session.grade,
            mode=session.mode,
            current_question=session.current_question,
            target_sentence=session.target_sentence,
        )
    except Exception as exc:
        logger.exception("Grammar evaluation failed")
        session.ui_state = UIState.ASKING
        await send_error(ws, f"Grammar evaluation failed: {exc}", session_id)
        await ask_question(ws, session)
        return

    if session.mode == SessionMode.REPEAT_CHECK and session.target_sentence:
        result = _finalize_repeat_check_result(
            text, session.target_sentence, result
        )
    elif session.mode == SessionMode.GRAMMAR_PRACTICE:
        result = _finalize_grammar_practice_result(result)

    _apply_grammar_result(session, result, user_text=text)
    await send_grammar_response(ws, session, result)
    await _after_grammar_tts(ws, session)


async def dispatch(ws: WebSocket, raw: dict[str, Any]) -> None:
    try:
        msg = WSMessage.model_validate(raw)
    except Exception:
        await send_error(ws, "Invalid message format")
        return

    if msg.session_id and "session_id" not in msg.payload:
        msg.payload = {**msg.payload, "session_id": msg.session_id}

    if msg.type == "control":
        await handle_control(ws, msg.payload)
    elif msg.type == "asr":
        await handle_asr(ws, msg.payload)
    else:
        await send_error(ws, f"Unsupported message type: {msg.type}", msg.session_id)

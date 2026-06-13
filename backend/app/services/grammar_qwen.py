import json
import logging
from pathlib import Path

from openai import AsyncOpenAI
from pydantic import ValidationError

from app.config import get_settings
from app.schemas.gpt_response import GrammarResponse
from app.schemas.lesson import LessonTemplate
from app.session.questions import QUESTIONS_PER_SCENARIO
from app.session.state import SessionMode

logger = logging.getLogger(__name__)

PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "grammar_teacher.txt"


def _build_system_prompt(
    lesson: LessonTemplate,
    grade: int,
    mode: SessionMode,
    current_question: str,
    target_sentence: str,
) -> str:
    template = PROMPT_PATH.read_text(encoding="utf-8")
    return template.format(
        grade=grade,
        display_name=lesson.display_name_en,
        grammar_focus=lesson.grammar_focus,
        description_en=lesson.description_en,
        kid_friendly_rule=lesson.kid_friendly_rule,
        error_hints=", ".join(lesson.error_hints),
        starter_questions=" | ".join(lesson.starter_questions),
        mode=mode.value,
        current_question=current_question or "(none)",
        target_sentence=target_sentence or "(none)",
        questions_per_scenario=QUESTIONS_PER_SCENARIO,
    )


async def evaluate_sentence(
    *,
    user_text: str,
    lesson: LessonTemplate,
    grade: int,
    mode: SessionMode,
    current_question: str = "",
    target_sentence: str = "",
) -> GrammarResponse:
    settings = get_settings()
    if not settings.dashscope_api_key:
        raise RuntimeError("DASHSCOPE_API_KEY is not configured in backend/.env")

    client = AsyncOpenAI(
        api_key=settings.dashscope_api_key,
        base_url=settings.dashscope_base_url,
    )

    system_prompt = _build_system_prompt(
        lesson, grade, mode, current_question, target_sentence
    )

    user_payload = {
        "user_text": user_text,
        "grade": grade,
        "mode": mode.value,
        "lesson_id": lesson.id,
        "current_question": current_question,
        "target_sentence": target_sentence,
    }

    extra_body: dict = {"enable_thinking": settings.qwen_enable_thinking}

    for attempt in range(2):
        response = await client.chat.completions.create(
            model=settings.qwen_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": f"Evaluate this student sentence and return JSON.\n{json.dumps(user_payload, ensure_ascii=False)}",
                },
            ],
            response_format={"type": "json_object"},
            extra_body=extra_body,
        )
        raw = response.choices[0].message.content or "{}"
        try:
            data = json.loads(raw)
            data["asr_text"] = user_text
            return GrammarResponse.model_validate(data)
        except (json.JSONDecodeError, ValidationError) as exc:
            logger.warning("Qwen JSON parse failed (attempt %s): %s", attempt + 1, exc)
            if attempt == 1:
                raise

    raise RuntimeError("Failed to parse Qwen response")

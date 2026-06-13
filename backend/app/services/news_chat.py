import json
import logging
from pathlib import Path

from openai import AsyncOpenAI
from pydantic import ValidationError

from app.config import get_settings
from app.schemas.news import DialogueTurnResponse, NewsArticle, WrapUpResponse
from app.services.news_text import truncate_words
from app.session.state import NewsPhase

logger = logging.getLogger(__name__)

DIALOGUE_PROMPT = (
    Path(__file__).resolve().parent.parent / "prompts" / "news_dialogue.txt"
)
WRAP_UP_PROMPT = (
    Path(__file__).resolve().parent.parent / "prompts" / "news_wrap_up.txt"
)


def _client() -> AsyncOpenAI:
    settings = get_settings()
    return AsyncOpenAI(
        api_key=settings.dashscope_api_key,
        base_url=settings.dashscope_base_url,
    )


async def generate_broadcast_script(article: NewsArticle, grade: int) -> str:
    prompt = (
        f"You are a friendly news reader for grade {grade} students. "
        f"Rewrite this news in simple English. "
        f"STRICT LIMIT: at most 180 words (under 200). "
        f"Use short sentences. Start with 'Here is today's news.' "
        f"Title: {article.title}. Source: {article.source}. "
        f"Story: {article.body}"
    )
    settings = get_settings()
    response = await _client().chat.completions.create(
        model=settings.qwen_model,
        messages=[{"role": "user", "content": prompt}],
        extra_body={"enable_thinking": settings.qwen_enable_thinking},
    )
    raw = (response.choices[0].message.content or article.body).strip()
    return truncate_words(raw, 200)


async def generate_opening_question(article: NewsArticle, grade: int) -> str:
    prompt = (
        f"Ask one engaging question in simple English for a grade {grade} student "
        f"about this news. Under 35 words. No preamble.\n"
        f"Title: {article.title}\nStory: {article.body[:600]}"
    )
    settings = get_settings()
    response = await _client().chat.completions.create(
        model=settings.qwen_model,
        messages=[{"role": "user", "content": prompt}],
        extra_body={"enable_thinking": settings.qwen_enable_thinking},
    )
    text = (response.choices[0].message.content or "").strip()
    return text or "What do you think about this news story?"


async def dialogue_turn(
    *,
    article: NewsArticle,
    grade: int,
    phase: NewsPhase,
    turn_count: int,
    min_turns: int,
    messages: list[dict],
    user_text: str,
) -> DialogueTurnResponse:
    template = DIALOGUE_PROMPT.read_text(encoding="utf-8")
    system = template.format(
        grade=grade,
        title=article.title,
        source=article.source,
        body=article.body[:800],
        phase=phase.value,
        turn_count=turn_count,
        min_turns=min_turns,
    )
    chat_messages = [{"role": "system", "content": system}, *messages]
    if user_text:
        chat_messages.append({"role": "user", "content": user_text})

    settings = get_settings()
    response = await _client().chat.completions.create(
        model=settings.qwen_model,
        messages=chat_messages,
        response_format={"type": "json_object"},
        extra_body={"enable_thinking": settings.qwen_enable_thinking},
    )
    raw = response.choices[0].message.content or "{}"
    try:
        data = json.loads(raw)
        result = DialogueTurnResponse.model_validate(data)
    except (json.JSONDecodeError, ValidationError) as exc:
        logger.warning("Dialogue JSON parse failed: %s", exc)
        result = DialogueTurnResponse(
            assistant_text="That's a great point! Can you tell me more?",
            phase="dialogue",
        )

    if turn_count < min_turns:
        result.phase = "dialogue"
    return result


async def generate_wrap_up(
    *,
    article: NewsArticle,
    grade: int,
    transcript_lines: list[str],
) -> WrapUpResponse:
    template = WRAP_UP_PROMPT.read_text(encoding="utf-8")
    prompt = template.format(
        grade=grade,
        title=article.title,
        source=article.source,
        body=article.body[:800],
        transcript="\n".join(transcript_lines[-80:]),
    )
    settings = get_settings()
    response = await _client().chat.completions.create(
        model=settings.qwen_model,
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        extra_body={"enable_thinking": settings.qwen_enable_thinking},
    )
    raw = response.choices[0].message.content or "{}"
    try:
        return WrapUpResponse.model_validate(json.loads(raw))
    except (json.JSONDecodeError, ValidationError) as exc:
        logger.warning("Wrap-up JSON parse failed: %s", exc)
        return WrapUpResponse(
            topic_summary=f"We talked about: {article.title}",
            overall_feedback="Great job discussing the news today!",
        )

import json
from pathlib import Path

from app.config import LESSONS_DIR
from app.schemas.lesson import LessonCustom, LessonSummary, LessonTemplate

LESSON_ORDER = ("present_simple", "present_continuous", "past_simple")

_lessons: dict[str, LessonTemplate] = {}


def load_lessons() -> dict[str, LessonTemplate]:
    global _lessons
    loaded: dict[str, LessonTemplate] = {}
    for path in sorted(LESSONS_DIR.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        lesson = LessonTemplate.model_validate(data)
        loaded[lesson.id] = lesson
    _lessons = loaded
    return _lessons


def get_lesson(lesson_id: str) -> LessonTemplate | None:
    if not _lessons:
        load_lessons()
    return _lessons.get(lesson_id)


def list_lessons() -> list[LessonSummary]:
    if not _lessons:
        load_lessons()
    ordered = [
        _lessons[lid] for lid in LESSON_ORDER if lid in _lessons
    ]
    extras = [l for lid, l in _lessons.items() if lid not in LESSON_ORDER]
    return [
        LessonSummary(
            id=l.id,
            display_name=l.display_name,
            display_name_en=l.display_name_en,
        )
        for l in [*ordered, *extras]
    ]


def resolve_lesson(
    lesson_id: str | None,
    lesson_custom: LessonCustom | None,
) -> LessonTemplate:
    if lesson_id:
        lesson = get_lesson(lesson_id)
        if lesson is None:
            raise ValueError(f"Unknown lesson_id: {lesson_id}")
        return lesson
    if lesson_custom:
        return lesson_custom.to_template()
    default = get_lesson("present_simple") or get_lesson("past_simple")
    if default is None:
        raise RuntimeError("No lessons loaded")
    return default

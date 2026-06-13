import random

from app.schemas.lesson import LessonTemplate

QUESTIONS_PER_SCENARIO = 5


def build_scenario_questions(
    lesson: LessonTemplate,
    count: int = QUESTIONS_PER_SCENARIO,
) -> list[str]:
    pool = [q.strip() for q in lesson.starter_questions if q.strip()]
    if not pool:
        return []
    random.shuffle(pool)
    if len(pool) >= count:
        return pool[:count]
    # Fewer than count configured: cycle without immediate repeat
    result = pool.copy()
    while len(result) < count:
        extra = pool.copy()
        random.shuffle(extra)
        for q in extra:
            if len(result) >= count:
                break
            if not result or result[-1] != q:
                result.append(q)
    return result[:count]

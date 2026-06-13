import uuid
from dataclasses import dataclass, field
from typing import Any

from app.config import get_settings
from app.schemas.gpt_response import GrammarResponse
from app.schemas.lesson import LessonTemplate
from app.schemas.news import NewsArticle
from app.session.questions import QUESTIONS_PER_SCENARIO, build_scenario_questions
from app.session.state import ActivityType, NewsPhase, SessionMode, UIState


@dataclass
class SessionState:
    session_id: str
    activity_type: ActivityType = ActivityType.GRAMMAR
    lesson: LessonTemplate | None = None
    grade: int = 3
    ui_state: UIState = UIState.HOME
    mode: SessionMode = SessionMode.GRAMMAR_PRACTICE
    current_question: str = ""
    target_sentence: str = ""
    last_response: GrammarResponse | None = None
    rounds_completed: int = 0
    attempt: int = 1
    scenario_questions: list[str] = field(default_factory=list)
    total_rounds: int = QUESTIONS_PER_SCENARIO
    # News theme
    news_phase: NewsPhase = NewsPhase.FETCH
    paused: bool = False
    turn_count: int = 0
    min_turns: int = 3
    article: NewsArticle | None = None
    chat_messages: list[dict[str, str]] = field(default_factory=list)
    transcript: list[dict[str, Any]] = field(default_factory=list)
    resume_phase: NewsPhase | None = None
    news_pending_step: str = ""


class SessionManager:
    def __init__(self) -> None:
        self._sessions: dict[str, SessionState] = {}

    def create(
        self,
        lesson: LessonTemplate,
        grade: int = 3,
    ) -> SessionState:
        session_id = str(uuid.uuid4())
        scenario_questions = build_scenario_questions(lesson)
        total_rounds = len(scenario_questions) or QUESTIONS_PER_SCENARIO
        question = scenario_questions[0] if scenario_questions else ""
        session = SessionState(
            session_id=session_id,
            activity_type=ActivityType.GRAMMAR,
            lesson=lesson,
            grade=grade,
            current_question=question,
            scenario_questions=scenario_questions,
            total_rounds=total_rounds,
        )
        self._sessions[session_id] = session
        return session

    def create_news(self, grade: int = 3) -> SessionState:
        settings = get_settings()
        session_id = str(uuid.uuid4())
        session = SessionState(
            session_id=session_id,
            activity_type=ActivityType.NEWS,
            grade=grade,
            min_turns=settings.news_min_turns,
            news_phase=NewsPhase.FETCH,
        )
        self._sessions[session_id] = session
        return session

    def get(self, session_id: str) -> SessionState | None:
        return self._sessions.get(session_id)

    def delete(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)


session_manager = SessionManager()

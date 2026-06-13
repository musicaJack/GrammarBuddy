from enum import StrEnum


class ActivityType(StrEnum):
    GRAMMAR = "grammar"
    NEWS = "news"


class NewsPhase(StrEnum):
    FETCH = "fetch"
    BROADCAST = "broadcast"
    OPEN_QUESTION = "open_question"
    DIALOGUE = "dialogue"
    WRAP_UP = "wrap_up"
    COMPLETE = "complete"


class UIState(StrEnum):
    HOME = "HOME"
    ASKING = "ASKING"
    LISTENING = "LISTENING"
    THINKING = "THINKING"
    FEEDBACK = "FEEDBACK"
    PRACTICE = "PRACTICE"
    PRACTICE_SUCCESS = "PRACTICE_SUCCESS"
    SCENARIO_COMPLETE = "SCENARIO_COMPLETE"


class SessionMode(StrEnum):
    GRAMMAR_PRACTICE = "grammar_practice"
    REPEAT_CHECK = "repeat_check"

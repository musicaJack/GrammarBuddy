from pydantic import BaseModel, Field

from app.session.state import UIState


class Evaluation(BaseModel):
    is_correct: bool
    score: int = Field(ge=0, le=100)


class Highlight(BaseModel):
    wrong: list[str] = Field(default_factory=list)
    correct: list[str] = Field(default_factory=list)


class Correction(BaseModel):
    correct_sentence: str
    error_type: str = ""
    highlight: Highlight = Field(default_factory=Highlight)


class Teaching(BaseModel):
    simple_explanation: str = ""
    kid_explanation: str = ""


class TtsText(BaseModel):
    primary: str = ""
    repeat_prompt: str = ""


class NextStep(BaseModel):
    action: str = "REPEAT"
    question: str = ""


class GrammarResponse(BaseModel):
    ui_state: UIState
    evaluation: Evaluation
    asr_text: str = ""
    correction: Correction | None = None
    teaching: Teaching = Field(default_factory=Teaching)
    tts: TtsText = Field(default_factory=TtsText)
    next_step: NextStep = Field(default_factory=NextStep)

from pydantic import BaseModel, Field


class NewsArticle(BaseModel):
    title: str
    source: str
    body: str
    url: str = ""


class DialogueTurnResponse(BaseModel):
    assistant_text: str
    phase: str = "dialogue"
    light_grammar_note: str = ""


class WrapUpResponse(BaseModel):
    topic_summary: str = ""
    logic_flow: list[str] = Field(default_factory=list)
    grammar_points: list[dict] = Field(default_factory=list)
    vocabulary: list[str] = Field(default_factory=list)
    overall_feedback: str = ""

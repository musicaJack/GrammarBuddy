from typing import Any, Literal

from pydantic import BaseModel, Field

MessageType = Literal["control", "asr", "gpt", "tts", "error"]


class WSMessage(BaseModel):
    type: MessageType
    session_id: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)

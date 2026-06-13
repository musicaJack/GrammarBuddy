from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# ASCII + common “smart” quotes pasted from browsers/editors
_STRIP_KEY_CHARS = " \t\n\r'\"`´''""„‟"

BACKEND_ROOT = Path(__file__).resolve().parent.parent
LESSONS_DIR = Path(__file__).resolve().parent / "config" / "lessons"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    dashscope_api_key: str = ""
    dashscope_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    dashscope_http_api_url: str = "https://dashscope.aliyuncs.com/api/v1"

    qwen_model: str = "qwen3.7-plus"
    qwen_enable_thinking: bool = False

    qwen_tts_model: str = "qwen3-tts-flash"
    qwen_tts_voice: str = "Cherry"
    qwen_tts_language: str = "English"

    qwen_asr_model: str = "qwen3-asr-flash"
    qwen_asr_language: str = "en"

    news_api_key: str = ""
    news_min_turns: int = 3

    tts_segment_max_words: int = 80
    tts_max_concurrent: int = 3

    host: str = "0.0.0.0"
    port: int = 8000
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @field_validator("dashscope_api_key", mode="before")
    @classmethod
    def normalize_api_key(cls, value: object) -> str:
        if value is None:
            return ""
        key = str(value).strip(_STRIP_KEY_CHARS)
        return key

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()

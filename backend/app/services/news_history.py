import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.config import BACKEND_ROOT

logger = logging.getLogger(__name__)

HISTORY_DIR = BACKEND_ROOT / "data" / "news_history"


def _ensure_dir() -> None:
    HISTORY_DIR.mkdir(parents=True, exist_ok=True)


def save_practice_record(
    *,
    session_id: str,
    grade: int,
    turn_count: int,
    min_turns: int,
    article: dict[str, Any],
    transcript: list[dict[str, Any]],
    wrap_up: dict[str, Any],
) -> Path:
    _ensure_dir()
    record = {
        "id": session_id,
        "saved_at": datetime.now(timezone.utc).isoformat(),
        "grade": grade,
        "turn_count": turn_count,
        "min_turns": min_turns,
        "article": article,
        "transcript": transcript,
        "wrap_up": wrap_up,
    }
    path = HISTORY_DIR / f"{session_id}.json"
    path.write_text(
        json.dumps(record, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    logger.info("Saved news practice history %s", path.name)
    return path


def list_practice_summaries() -> list[dict[str, Any]]:
    _ensure_dir()
    items: list[dict[str, Any]] = []
    for path in HISTORY_DIR.glob("*.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Skip invalid history file %s: %s", path.name, exc)
            continue
        article = data.get("article") or {}
        wrap_up = data.get("wrap_up") or {}
        items.append(
            {
                "id": data.get("id") or path.stem,
                "saved_at": data.get("saved_at", ""),
                "turn_count": data.get("turn_count", 0),
                "min_turns": data.get("min_turns", 0),
                "grade": data.get("grade", 3),
                "article_title": article.get("title") or "News practice",
                "article_source": article.get("source") or "",
                "topic_summary": wrap_up.get("topic_summary") or "",
            }
        )
    items.sort(key=lambda x: x.get("saved_at") or "", reverse=True)
    return items


def load_practice_record(session_id: str) -> dict[str, Any] | None:
    _ensure_dir()
    path = HISTORY_DIR / f"{session_id}.json"
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Failed to read history %s: %s", path.name, exc)
        return None

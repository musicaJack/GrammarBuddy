import json
from functools import lru_cache
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
COMPAT_PATH = REPO_ROOT / "shared" / "version" / "compatibility.json"

PROTOCOL_VERSION = "1.0.0"
BACKEND_VERSION = "0.4.0"


@lru_cache
def load_compatibility() -> dict:
    if COMPAT_PATH.is_file():
        return json.loads(COMPAT_PATH.read_text(encoding="utf-8"))
    return {
        "protocol_version": PROTOCOL_VERSION,
        "backend_version": BACKEND_VERSION,
        "clients": {},
    }


def get_version_payload() -> dict:
    compat = load_compatibility()
    return {
        "protocol_version": compat.get("protocol_version", PROTOCOL_VERSION),
        "backend_version": compat.get("backend_version", BACKEND_VERSION),
        "clients": compat.get("clients", {}),
    }

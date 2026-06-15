import logging
from dataclasses import dataclass

from app.version_info import PROTOCOL_VERSION

logger = logging.getLogger(__name__)

VALID_CLIENT_TYPES = frozenset({"web_simulator", "stopwatch", "unknown"})


@dataclass
class ClientInfo:
    client_type: str = "unknown"
    client_version: str = ""
    protocol_version: str = ""
    device_id: str = ""


def parse_client_info(payload: dict) -> ClientInfo:
    raw_type = str(payload.get("client_type") or "unknown").strip().lower()
    client_type = raw_type if raw_type in VALID_CLIENT_TYPES else "unknown"
    return ClientInfo(
        client_type=client_type,
        client_version=str(payload.get("client_version") or "").strip(),
        protocol_version=str(payload.get("protocol_version") or "").strip(),
        device_id=str(payload.get("device_id") or "").strip(),
    )


def apply_client_info(session, info: ClientInfo) -> None:
    session.client_type = info.client_type
    session.client_version = info.client_version
    session.protocol_version = info.protocol_version or PROTOCOL_VERSION
    session.device_id = info.device_id


def _parse_semver(value: str) -> tuple[int, int, int]:
    parts = (value or "0.0.0").split(".")
    nums: list[int] = []
    for part in parts[:3]:
        try:
            nums.append(int(part))
        except ValueError:
            nums.append(0)
    while len(nums) < 3:
        nums.append(0)
    return nums[0], nums[1], nums[2]


def check_protocol_version(client_version: str) -> tuple[bool, str]:
    if not client_version:
        return True, ""
    client_major, _, _ = _parse_semver(client_version)
    server_major, _, _ = _parse_semver(PROTOCOL_VERSION)
    if client_major != server_major:
        return (
            False,
            f"Protocol mismatch: client={client_version}, server={PROTOCOL_VERSION}",
        )
    return True, ""


def log_client_connect(info: ClientInfo, session_id: str, activity: str) -> None:
    logger.info(
        "Session %s (%s): client_type=%s client_version=%s protocol=%s device_id=%s",
        session_id,
        activity,
        info.client_type,
        info.client_version or "-",
        info.protocol_version or PROTOCOL_VERSION,
        info.device_id or "-",
    )

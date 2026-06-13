from fastapi import WebSocket

from app.schemas.messages import WSMessage
from app.session.manager import SessionState


async def send_message(ws: WebSocket, msg: WSMessage) -> None:
    await ws.send_json(msg.model_dump(exclude_none=True))


async def send_error(ws: WebSocket, message: str, session_id: str | None = None) -> None:
    await send_message(
        ws,
        WSMessage(type="error", session_id=session_id, payload={"message": message}),
    )


async def send_ui_state(ws: WebSocket, session: SessionState) -> None:
    await send_message(
        ws,
        WSMessage(
            type="control",
            session_id=session.session_id,
            payload={"action": "ui_state", "ui_state": session.ui_state.value},
        ),
    )


async def send_phase_complete(ws: WebSocket, session: SessionState) -> None:
    await send_message(
        ws,
        WSMessage(
            type="control",
            session_id=session.session_id,
            payload={"action": "phase_complete", "next": "listen"},
        ),
    )


async def send_await_continue(ws: WebSocket, session: SessionState) -> None:
    await send_message(
        ws,
        WSMessage(
            type="control",
            session_id=session.session_id,
            payload={"action": "phase_complete", "next": "continue"},
        ),
    )

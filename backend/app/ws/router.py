import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.ws.handler import dispatch

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/session")
async def websocket_session(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_json()
            await dispatch(websocket, data)
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
    except Exception:
        logger.exception("WebSocket error")
        await websocket.close()

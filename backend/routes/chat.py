# backend/routes/chat.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from backend.main import get_current_user
from typing import List, Dict

router = APIRouter(prefix="/ws", tags=["Chat"])

# Lista de conexiones activas
active_connections: Dict[int, WebSocket] = {}

@router.websocket("/chat/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: int):
    await websocket.accept()
    active_connections[user_id] = websocket
    try:
        while True:
            data = await websocket.receive_text()
            # reenviar el mensaje a todos los conectados
            for uid, conn in active_connections.items():
                if conn != websocket:
                    await conn.send_text(f"{user_id}: {data}")
    except WebSocketDisconnect:
        del active_connections[user_id]

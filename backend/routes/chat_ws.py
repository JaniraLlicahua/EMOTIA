# backend/routes/chat_ws.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from backend.database import SessionLocal
from backend.models import Message, User
from datetime import datetime

router = APIRouter(prefix="/ws", tags=["Chat WebSocket"])

# 🟢 Diccionario de conexiones activas: { user_id: WebSocket }
active_connections: dict[int, WebSocket] = {}


# ======================================================
# 🔧 Sesión de BD (para usar dentro del WebSocket)
# ======================================================
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ======================================================
# 💬 WebSocket principal del chat
# ======================================================
@router.websocket("/chat/{user_id}/{receiver_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: int, receiver_id: int):
    await websocket.accept()
    active_connections[user_id] = websocket
    print(f"🟢 Usuario {user_id} conectado al chat con {receiver_id}")

    # 🔔 Notificar al receptor que este usuario está en línea
    if receiver_id in active_connections:
        await active_connections[receiver_id].send_text(f"status:{user_id}:online")

    try:
        while True:
            # Esperar mensajes del cliente
            message_text = await websocket.receive_text()
            print(f"📩 Mensaje recibido de {user_id} → {receiver_id}: {message_text}")

            # Guardar mensaje en BD
            db = SessionLocal()
            try:
                new_msg = Message(
                    sender_id=user_id,
                    receiver_id=receiver_id,
                    content=message_text,
                    sent_at=datetime.utcnow(),
                )
                db.add(new_msg)
                db.commit()
            except Exception as e:
                print(f"❌ Error al guardar mensaje: {e}")
                db.rollback()
            finally:
                db.close()

            # Enviar mensaje al receptor si está conectado
            if receiver_id in active_connections:
                try:
                    await active_connections[receiver_id].send_text(f"{user_id}:{message_text}")
                    print(f"📤 Enviado a {receiver_id}")
                except Exception as e:
                    print(f"⚠️ Error enviando a receptor {receiver_id}: {e}")

            # Reflejar el mensaje al propio emisor
            try:
                await websocket.send_text(f"yo:{message_text}")
            except Exception as e:
                print(f"⚠️ Error enviando eco al emisor {user_id}: {e}")

    except WebSocketDisconnect:
        # 🔴 Usuario se desconectó
        if user_id in active_connections:
            del active_connections[user_id]
        print(f"🔴 Usuario {user_id} desconectado")

        # Notificar al receptor que este usuario se desconectó
        if receiver_id in active_connections:
            try:
                await active_connections[receiver_id].send_text(f"status:{user_id}:offline")
                print(f"🔕 Aviso de desconexión enviado a {receiver_id}")
            except Exception as e:
                print(f"⚠️ Error notificando desconexión a {receiver_id}: {e}")

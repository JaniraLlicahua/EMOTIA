# backend/routes/chat_rest.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database import SessionLocal
from backend.models import Message, User
from typing import List

router = APIRouter(prefix="/chat", tags=["Chat REST"])

# =====================================================
# 🧩 Sesión de base de datos
# =====================================================
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# =====================================================
# 💬 Historial de chat entre dos usuarios
# =====================================================
@router.get("/history/{user_id}/{receiver_id}")
def get_history(user_id: int, receiver_id: int, db: Session = Depends(get_db)):
    messages = db.query(Message).filter(
        ((Message.sender_id == user_id) & (Message.receiver_id == receiver_id)) |
        ((Message.sender_id == receiver_id) & (Message.receiver_id == user_id))
    ).order_by(Message.sent_at.asc()).all()

    return [
        {
            "sender_id": msg.sender_id,
            "receiver_id": msg.receiver_id,
            "content": msg.content,
            "sent_at": msg.sent_at.strftime("%H:%M"),
        }
        for msg in messages
    ]


# =====================================================
# 👥 Lista de pacientes asignados a un psicólogo
# =====================================================
@router.get("/contacts/{psychologist_id}")
def get_contacts(psychologist_id: int, db: Session = Depends(get_db)):
    """
    Devuelve los pacientes asignados a un psicólogo específico.
    Se usa el campo `assigned_to` en la tabla `users`.
    """
    psychologist = db.query(User).filter(User.id == psychologist_id, User.role == "psychologist").first()
    if not psychologist:
        raise HTTPException(status_code=404, detail="Psicólogo no encontrado")

    # Buscar pacientes que tengan assigned_to = psychologist_id
    patients = db.query(User).filter(User.assigned_to == psychologist_id, User.role == "patient").all()

    if not patients:
        return []  # Devolver lista vacía, no error

    return [
        {"id": p.id, "username": p.username, "email": p.email or "", "role": p.role}
        for p in patients
    ]


# =====================================================
# 🧠 Psicólogo asignado a un paciente
# =====================================================
@router.get("/assigned/{patient_id}")
def get_assigned_psychologist(patient_id: int, db: Session = Depends(get_db)):
    """
    Devuelve el psicólogo asignado al paciente, usando `assigned_to`.
    Si no tiene asignado, devuelve error 404.
    """
    patient = db.query(User).filter(User.id == patient_id, User.role == "patient").first()
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")

    if not patient.assigned_to:
        raise HTTPException(status_code=404, detail="Este paciente no tiene psicólogo asignado")

    psychologist = db.query(User).filter(User.id == patient.assigned_to, User.role == "psychologist").first()
    if not psychologist:
        raise HTTPException(status_code=404, detail="Psicólogo asignado no encontrado")

    return {
        "psychologist_id": psychologist.id,
        "psychologist_name": psychologist.username,
        "psychologist_email": psychologist.email,
    }

# backend/routes/sessions.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from backend.database import SessionLocal
from backend.models import SessionModel, Appointment, User
from backend.main import get_current_user

router = APIRouter(prefix="/sessions", tags=["Sessions"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/{meeting_id}")
def create_session(meeting_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "psychologist":
        raise HTTPException(status_code=403, detail="Solo psicólogos pueden iniciar sesiones")

    now = datetime.now()

    meeting = db.query(Appointment).filter(
        Appointment.id == meeting_id,
        Appointment.psychologist_id == current_user.id,
    ).first()

    if not meeting:
        raise HTTPException(status_code=404, detail="Reunión no encontrada")

    # Si ya tiene sesión asignada o no está pendiente, no crear otra
    if meeting.real_session_id is not None or meeting.status != "pendiente":
        raise HTTPException(status_code=400, detail="La reunión ya está en progreso o ya tiene sesión asignada")

    session = SessionModel(
        appointment_id=meeting.id,
        status="activa"
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    meeting.real_session_id = session.id
    meeting.status = "en_progreso"
    db.commit()

    return {
        "session_id": session.id,
        "meeting_id": meeting.id,
        "message": "Sesión iniciada correctamente"
    }


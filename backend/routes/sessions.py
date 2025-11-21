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
def create_or_get_session(
    meeting_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # SOLO psicólogo inicia la sesión si no existe
    if current_user.role not in ["psychologist", "patient"]:
        raise HTTPException(status_code=403, detail="Rol no permitido")

    meeting = db.query(Appointment).filter(
        Appointment.id == meeting_id
    ).first()

    if not meeting:
        raise HTTPException(status_code=404, detail="Reunión no encontrada")

    # -------------------------
    # 🔥 SI YA EXISTE → DEVOLVER LA MISMA SESIÓN
    # -------------------------
    if meeting.real_session_id:
        session = db.query(SessionModel).filter(SessionModel.id == meeting.real_session_id).first()

        if session:
            return {
                "session_id": session.id,
                "meeting_id": meeting.id,
                "message": "Sesión reutilizada"
            }

    # -------------------------
    # 🔥 SI NO EXISTE → CREARLA
    # -------------------------
    if current_user.role != "psychologist":
        raise HTTPException(status_code=403, detail="Solo el psicólogo puede iniciar la sesión por primera vez")

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
        "message": "Sesión creada correctamente"
    }

# backend/routes/meetings.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from backend.database import SessionLocal
from backend.models import Appointment, User
from backend.main import get_current_user

router = APIRouter(prefix="/meetings", tags=["Meetings"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Crear nueva reunión
@router.post("/")
def create_meeting(data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "psychologist":
        raise HTTPException(status_code=403, detail="No autorizado")

    patient_id = data.get("patient_id")
    date_str = data.get("date")
    time_str = data.get("time")
    topic = data.get("topic", "")
    mode = data.get("mode", "virtual")

    if not patient_id or not date_str or not time_str:
        raise HTTPException(status_code=400, detail="Campos incompletos")

    try:
        scheduled_at = datetime.strptime(f"{date_str} {time_str}", "%Y-%m-%d %H:%M")
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha u hora incorrecto")

    meeting = Appointment(
        psychologist_id=current_user.id,
        patient_id=patient_id,
        scheduled_at=scheduled_at,
        status="programada",
        notes=topic,
        mode=mode
    )
    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    return {"message": "Reunión creada correctamente", "id": meeting.id}

# Listar reuniones (ajustando zona horaria y rango)
@router.get("/")
def get_user_meetings(
    start: str = Query(None),
    end: str = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Appointment)
    if current_user.role == "psychologist":
        q = q.filter(Appointment.psychologist_id == current_user.id)
    elif current_user.role == "patient":
        q = q.filter(Appointment.patient_id == current_user.id)
    else:
        raise HTTPException(status_code=403, detail="Rol no permitido")

    if start and end:
        try:
            start_dt = datetime.fromisoformat(start.replace("Z", ""))
            end_dt = datetime.fromisoformat(end.replace("Z", ""))
            q = q.filter(Appointment.scheduled_at >= start_dt, Appointment.scheduled_at <= end_dt)
        except ValueError:
            raise HTTPException(status_code=400, detail="Fechas inválidas (esperado ISO)")

    meetings = q.order_by(Appointment.scheduled_at).all()
    return [
        {
            "id": m.id,
            "date": m.scheduled_at.strftime("%Y-%m-%d"),
            "time": m.scheduled_at.strftime("%H:%M"),
            "topic": m.notes or "",
            "status": m.status,
            "patient_id": m.patient_id,
            "psychologist_id": m.psychologist_id,
        }
        for m in meetings
    ]

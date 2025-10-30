from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
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

# 🧩 Crear nueva reunión
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
    )
    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    return {"message": "Reunión creada correctamente", "id": meeting.id}

# 📅 Listar reuniones (por usuario)
@router.get("/")
def get_user_meetings(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    q = db.query(Appointment)
    if current_user.role == "psychologist":
        q = q.filter(Appointment.psychologist_id == current_user.id)
    elif current_user.role == "patient":
        q = q.filter(Appointment.patient_id == current_user.id)
    else:
        raise HTTPException(status_code=403, detail="Rol no permitido")

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

# ✏️ Editar reunión
@router.put("/{meeting_id}")
def edit_meeting(meeting_id: int, data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    meeting = db.query(Appointment).filter(Appointment.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="No encontrada")

    if current_user.role != "psychologist" or meeting.psychologist_id != current_user.id:
        raise HTTPException(status_code=403, detail="No autorizado")

    date_str = data.get("date")
    time_str = data.get("time")
    if date_str and time_str:
        meeting.scheduled_at = datetime.strptime(f"{date_str} {time_str}", "%Y-%m-%d %H:%M")

    meeting.notes = data.get("topic", meeting.notes)
    meeting.status = data.get("status", meeting.status)
    db.commit()
    return {"message": "Reunión actualizada correctamente"}

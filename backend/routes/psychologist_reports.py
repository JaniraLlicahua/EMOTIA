# backend/routes/psychologist_reports.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from backend.database import SessionLocal
from backend.models import SessionModel, Report, User
from backend.main import get_current_user

router = APIRouter(prefix="/psychologist/sessions", tags=["Reports"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/{session_id}/report")
def save_session_report(session_id: int, data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "psychologist":
        raise HTTPException(status_code=403, detail="Solo psicólogos pueden guardar reportes")

    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    # obtiene el paciente
    patient_id = data.get("patient_id") or (session.appointment.patient_id if session.appointment else None)
    if not patient_id:
        raise HTTPException(status_code=400, detail="Paciente no encontrado")

    summary = data.get("summary", "")
    emotions_raw = data.get("emotions", "")
    if emotions_raw:
        summary += f"\n\nEmociones detectadas: {emotions_raw}"

    report = Report(
        session_id=session.id,
        psychologist_id=current_user.id,
        patient_id=patient_id,
        summary=summary,
        progress_percent=min(100, len(emotions_raw.split(',')) * 10),
        status="activo"
    )
    db.add(report)

    # cerrar sesión
    session.status = "cerrada"
    session.ended_at = datetime.utcnow()

    db.commit()
    db.refresh(report)
    return {"message": "✅ Reporte guardado automáticamente", "report_id": report.id}

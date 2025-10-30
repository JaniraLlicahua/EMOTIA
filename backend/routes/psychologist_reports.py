#backend\routes\psychologist_reports.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from backend.database import SessionLocal
from backend.models import User, Report, SessionModel
from backend.main import get_current_user
from backend.models import User, Report, SessionModel, Appointment

router = APIRouter(
    prefix="/psychologist/reports",
    tags=["Psychologist Reports"]
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# =====================================
# 🧠 Crear un nuevo reporte del paciente
# =====================================
@router.post("/")
def create_report(data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "psychologist":
        raise HTTPException(status_code=403, detail="No autorizado")

    patient_id = data.get("patient_id")
    summary = data.get("summary")
    progress_percent = data.get("progress_percent", 0)

    if not patient_id or not summary:
        raise HTTPException(status_code=400, detail="Faltan campos obligatorios")

    report = Report(
        psychologist_id=current_user.id,
        patient_id=patient_id,
        summary=summary,
        progress_percent=progress_percent,
        created_at=datetime.utcnow(),
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return {"message": "Reporte creado correctamente", "report_id": report.id}


# =====================================
# 📜 Listar los reportes del psicólogo
# =====================================
@router.get("/")
def list_reports(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "psychologist":
        raise HTTPException(status_code=403, detail="No autorizado")

    reports = db.query(Report).filter(Report.psychologist_id == current_user.id).all()
    return [
        {
            "id": r.id,
            "patient_id": r.patient_id,
            "summary": r.summary,
            "progress_percent": r.progress_percent,
            "created_at": r.created_at.strftime("%Y-%m-%d"),
            "status": r.status,
        }
        for r in reports
    ]

# =====================================
# 👥 Listar pacientes del psicólogo con emociones detectadas
# =====================================
@router.get("/patients")
def get_psychologist_patients(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "psychologist":
        raise HTTPException(status_code=403, detail="No autorizado")

    # 🔹 Buscar pacientes asignados a este psicólogo
    patients = db.query(User).filter(User.assigned_to == current_user.id, User.role == "patient").all()

    return [
        {"id": p.id, "username": p.username, "email": p.email}
        for p in patients
    ]

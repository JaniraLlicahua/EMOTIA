# backend/routes/psychologist.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database import SessionLocal
from backend.models import User, Detection
from backend.main import get_current_user

router = APIRouter(prefix="/psychologist", tags=["Psychologist"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ================================
# 👥 Obtener pacientes asignados
# ================================
@router.get("/patients")
def get_assigned_patients(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "psychologist":
        raise HTTPException(status_code=403, detail="No autorizado")

    patients = db.query(User).filter(User.assigned_to == current_user.id).all()
    return [
        {
            "id": u.id,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "email": u.email,
            "status": u.status,
            "birth_date": u.birth_date,
            "created_at": u.created_at,
        }
        for u in patients
    ]


# ================================
# 📊 Obtener emociones de un paciente
# ================================
@router.get("/emotions/{patient_id}")
def get_patient_emotions(patient_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "psychologist":
        raise HTTPException(status_code=403, detail="No autorizado")

    detections = db.query(Detection).filter(Detection.user_id == patient_id).all()

    if not detections:
        raise HTTPException(status_code=404, detail="Sin registros de emociones")

    summary = {}
    for d in detections:
        summary[d.emotion] = summary.get(d.emotion, 0) + 1

    total = sum(summary.values())
    percentages = {k: round((v / total) * 100, 2) for k, v in summary.items()}

    return {"patient_id": patient_id, "summary": percentages, "total": total}


# ================================
# 🧾 Guardar reporte del psicólogo
# ================================
@router.post("/report")
def save_report(data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "psychologist":
        raise HTTPException(status_code=403, detail="No autorizado")

    # Simular guardado
    print("Reporte guardado:", data)
    return {"message": "Reporte guardado exitosamente", "data": data}

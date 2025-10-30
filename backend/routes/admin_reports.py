from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.database import SessionLocal
from backend.models import User, Report, Appointment
from backend.main import get_current_user

router = APIRouter(prefix="/admin/reports", tags=["Admin Reports"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# =============================
# 📊 Resumen de estadísticas
# =============================
@router.get("/summary")
def get_summary(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="No autorizado")

    total_patients = db.query(User).filter(User.role == "patient").count()
    active_psychologists = db.query(User).filter(User.role == "psychologist", User.status == "activo").count()

    avg_progress = db.query(func.avg(Report.progress_percent)).scalar() or 0
    top_psych = (
        db.query(User.first_name)
        .join(Report, Report.psychologist_id == User.id)
        .group_by(User.id)
        .order_by(func.count(Report.id).desc())
        .first()
    )
    top_psychologist = top_psych[0] if top_psych else None

    # Ejemplo de datos de gráficos (en la versión final esto vendrá de tus registros)
    months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun"]
    progress_by_month = [60, 70, 75, 80, 78, 85]
    specialties = {"Infantil": 4, "Clínica": 3, "Familiar": 2, "Educativa": 1}
    weeks = ["Sem 1", "Sem 2", "Sem 3", "Sem 4"]
    sessions_per_week = [10, 14, 9, 13]

    return {
        "total_patients": total_patients,
        "active_psychologists": active_psychologists,
        "avg_progress": round(avg_progress, 2),
        "top_psychologist": top_psychologist,
        "months": months,
        "progress_by_month": progress_by_month,
        "specialties": specialties,
        "weeks": weeks,
        "sessions_per_week": sessions_per_week,
    }


# =============================
# 🧾 Obtener todos los reportes
# =============================
@router.get("", tags=["Admin Reports"])
def get_reports(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="No autorizado")

    reports = db.query(Report).all()
    result = []
    for r in reports:
        patient = db.query(User).filter(User.id == r.patient_id).first()
        psy = db.query(User).filter(User.id == r.psychologist_id).first()
        result.append({
            "id": r.id,
            "patient_name": f"{patient.first_name} {patient.last_name}" if patient else None,
            "psychologist_name": f"{psy.first_name} {psy.last_name}" if psy else None,
            "created_at": r.created_at.strftime("%Y-%m-%d") if r.created_at else None,
            "progress_percent": r.progress_percent,
            "status": r.status,
        })
    return result


# =============================
# ❌ Eliminar reporte
# =============================
@router.delete("/{report_id}")
def delete_report(report_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="No autorizado")

    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")

    db.delete(report)
    db.commit()
    return {"message": "Reporte eliminado correctamente"}


# backend/routes/psychologist.py
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from backend.database import SessionLocal
from backend.models import User, Detection, Report
from backend.main import get_current_user
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.pdfgen import canvas
import os

router = APIRouter(prefix="/psychologist", tags=["Psychologist"])

# ----------------------------
# DB Dependency
# ----------------------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# =====================================================
# 🧾 Guardar reporte con formato profesional
# =====================================================
@router.post("/report", status_code=200)
def save_report(data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "psychologist":
        raise HTTPException(status_code=403, detail="No autorizado")

    report = Report(
        patient_id=data["patient_id"],
        psychologist_id=current_user.id,
        motivo=data.get("motivo"),
        tecnica=data.get("tecnica"),
        observaciones=data.get("observaciones"),
        resultados=data.get("resultados"),
        conclusiones=data.get("conclusiones"),
        recomendaciones=data.get("recomendaciones"),
        created_at=datetime.now()
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    reports_dir = "backend/reports"
    os.makedirs(reports_dir, exist_ok=True)
    pdf_path = f"{reports_dir}/reporte_{report.id}.pdf"

    # === Generar PDF ===
    c = canvas.Canvas(pdf_path, pagesize=A4)
    width, height = A4

    c.setFont("Helvetica-Bold", 18)
    c.drawString(140, height - 60, "REPORTE PSICOLÓGICO DEL PACIENTE")
    c.setFont("Helvetica", 10)
    c.drawString(140, height - 80, f"Fecha: {datetime.now().strftime('%d/%m/%Y - %H:%M')}")

    c.setStrokeColor(colors.gray)
    c.line(40, height - 100, width - 40, height - 100)

    y = height - 140
    c.setFont("Helvetica-Bold", 12)
    c.drawString(40, y, "Datos del paciente:")
    y -= 20
    patient = db.query(User).filter(User.id == data["patient_id"]).first()
    if patient:
        c.setFont("Helvetica", 10)
        c.drawString(60, y, f"Nombre: {patient.first_name} {patient.last_name}")
        y -= 15
        c.drawString(60, y, f"Correo: {patient.email}")
        y -= 15
        c.drawString(60, y, f"Fecha de registro: {patient.created_at.strftime('%d/%m/%Y')}")
        y -= 25

    # Contenido del reporte
    c.setFont("Helvetica-Bold", 12)
    c.drawString(40, y, "Contenido del reporte:")
    y -= 20
    c.setFont("Helvetica", 10)

    for campo, valor in data.items():
        texto = f"{campo.capitalize()}: {valor}"
        lines = []
        while len(texto) > 90:
            lines.append(texto[:90])
            texto = texto[90:]
        lines.append(texto)
        for line in lines:
            if y < 80:
                c.showPage()
                y = height - 100
            c.drawString(60, y, line)
            y -= 15
        y -= 10

    c.save()
    return {"message": "Reporte guardado exitosamente", "report_id": report.id}

# =====================================================
# 🧑‍🤝‍🧑 Obtener pacientes asignados al psicólogo
# =====================================================
@router.get("/patients")
def get_assigned_patients(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "psychologist":
        raise HTTPException(status_code=403, detail="No autorizado")

    patients = (
        db.query(User)
        .filter(User.role == "patient", User.assigned_to == current_user.id)
        .all()
    )

    result = []
    for p in patients:
        result.append({
            "id": p.id,
            "first_name": p.first_name,
            "last_name": p.last_name,
            "email": p.email,
            "created_at": p.created_at.strftime("%Y-%m-%d") if p.created_at else None,
            "status": p.status
        })
    return result

# =====================================================
# 😊 Obtener emociones detectadas del paciente
# =====================================================
@router.get("/emotions/{patient_id}")
def get_patient_emotions(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "psychologist":
        raise HTTPException(status_code=403, detail="No autorizado")

    detections = (
        db.query(Detection)
        .filter(Detection.patient_id == patient_id)
        .filter(Detection.psychologist_id == current_user.id)
        .all()
    )

    if not detections:
        raise HTTPException(status_code=404, detail="No se encontraron emociones para este paciente")

    emotion_counts = {}
    for det in detections:
        emotion = det.emotion.lower()
        emotion_counts[emotion] = emotion_counts.get(emotion, 0) + 1

    total = sum(emotion_counts.values())
    summary = {k: round((v / total) * 100, 2) for k, v in emotion_counts.items()}

    return {"patient_id": patient_id, "summary": summary}

# =====================================================
# 📥 Descargar reporte generado
# =====================================================
@router.get("/reports/{report_id}/download")
def download_report(report_id: int):
    file_path = f"backend/reports/reporte_{report_id}.pdf"
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="El reporte no existe")
    return FileResponse(file_path, media_type="application/pdf", filename=f"reporte_{report_id}.pdf")

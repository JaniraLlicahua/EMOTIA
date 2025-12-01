#backend\routes\reports.py
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from datetime import datetime
import os

from backend.database import SessionLocal
from backend.models import Appointment, SessionModel, User, Detection
from backend.main import get_current_user

router = APIRouter(prefix="/reports", tags=["Reports"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/generate")
def generate_report(data: dict, 
                    db: Session = Depends(get_db),
                    current_user: User = Depends(get_current_user)):
    
    if current_user.role != "psychologist":
        raise HTTPException(status_code=403, detail="No autorizado")

    session_id = data.get("session_id")
    notes = data.get("notes", "")

    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    appointment = session.appointment
    patient = db.query(User).filter(User.id == appointment.patient_id).first()

    # Obtener detecciones de emociones
    detections = db.query(Detection).filter(Detection.session_id == session_id).all()

    emotion_counts = {}
    for d in detections:
        emotion_counts[d.emotion] = emotion_counts.get(d.emotion, 0) + 1

    # Crear carpeta
    reports_dir = "backend/reports"
    os.makedirs(reports_dir, exist_ok=True)

    pdf_path = f"{reports_dir}/session_report_{session_id}.pdf"

    # ======== GENERAR PDF ALTO NIVEL ============
    styles = getSampleStyleSheet()
    story = []

    story.append(Paragraph("<b>REPORTE PSICOLÓGICO DE SESIÓN</b>", styles["Title"]))
    story.append(Spacer(1, 12))

    info = f"""
    <b>Psicólogo:</b> {current_user.first_name} {current_user.last_name}<br/>
    <b>Paciente:</b> {patient.first_name} {patient.last_name}<br/>
    <b>Fecha:</b> {datetime.now().strftime("%d/%m/%Y %H:%M")}<br/>
    """
    story.append(Paragraph(info, styles["Normal"]))
    story.append(Spacer(1, 12))

    story.append(Paragraph("<b>Notas del Psicólogo:</b>", styles["Heading3"]))
    story.append(Paragraph(notes.replace("\n", "<br/>"), styles["Normal"]))
    story.append(Spacer(1, 12))

    story.append(Paragraph("<b>Emociones Detectadas:</b>", styles["Heading3"]))

    if not emotion_counts:
        story.append(Paragraph("No se registraron emociones.", styles["Normal"]))
    else:
        for emo, qty in emotion_counts.items():
            story.append(Paragraph(f"- {emo}: {qty}", styles["Normal"]))

    doc = SimpleDocTemplate(pdf_path, pagesize=A4)
    doc.build(story)

    return FileResponse(pdf_path, filename=f"session_report_{session_id}.pdf")

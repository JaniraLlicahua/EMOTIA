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

router = APIRouter(prefix="", tags=["Psychologist"])

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
# 🧾 Guardar reporte con formato profesional (POST /psychologist/report)
# =====================================================
@router.post("/report")
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
        created_at=datetime.utcnow()
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
        c.drawString(60, y, f"Nombre: {patient.first_name or ''} {patient.last_name or ''}")
        y -= 15
        c.drawString(60, y, f"Correo: {patient.email or ''}")
        y -= 15
        if patient.created_at:
            c.drawString(60, y, f"Fecha de registro: {patient.created_at.strftime('%d/%m/%Y')}")
            y -= 15
        y -= 10

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
def get_assigned_patients(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "psychologist":
        raise HTTPException(status_code=403, detail="No autorizado")

    patients = db.query(User).filter(User.role == "patient", User.assigned_to == current_user.id).all()

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
# 😊 Obtener emociones detectadas del paciente (compatible con frontend /patients/{id}/emotions)
# =====================================================
@router.get("/emotions/{patient_id}")
def get_patient_emotions(patient_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Mantiene la ruta original /psychologist/emotions/{patient_id} para compatibilidad.
    Devuelve summary {} si no hay detecciones (no 404) — así el frontend no rompe.
    """
    if current_user.role != "psychologist":
        raise HTTPException(status_code=403, detail="No autorizado")

    detections = (
        db.query(Detection)
        .filter(Detection.patient_id == patient_id)
        .filter(Detection.psychologist_id == current_user.id)
        .all()
    )

    emotion_counts = {}
    for det in detections:
        emotion = (det.emotion or "").lower()
        emotion_counts[emotion] = emotion_counts.get(emotion, 0) + 1

    total = sum(emotion_counts.values())
    summary = {k: round((v / total) * 100, 2) for k, v in emotion_counts.items()} if total > 0 else {}

    return {"patient_id": patient_id, "summary": summary}

# =====================================================
# --- RUTAS COMPATIBLES CON FRONTEND: /patients/{id}/...
# =====================================================
@router.get("/patients/{patient_id}/emotions", tags=["Psychologist", "Patient-compat"])
def patient_emotions_compat(patient_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Ruta que el frontend original intenta llamar: GET /patients/{id}/emotions
    Reusa la lógica previa pero permite devolver {} si no hay detecciones.
    """
    # Permitir psicólogo ver las emociones de sus pacientes
    if current_user.role != "psychologist":
        raise HTTPException(status_code=403, detail="No autorizado")

    detections = db.query(Detection).filter(Detection.patient_id == patient_id, Detection.psychologist_id == current_user.id).all()
    emotion_counts = {}
    for d in detections:
        k = (d.emotion or "").lower()
        emotion_counts[k] = emotion_counts.get(k, 0) + 1
    total = sum(emotion_counts.values())
    summary = {k: round((v/total)*100,2) for k,v in emotion_counts.items()} if total>0 else {}
    # Devolver en formato que tu frontend espera (antes esperaba objeto con propiedades)
    # Ejemplo: { "happy": 40.0, ... }
    return {"patient_id": patient_id, "summary": summary}

# =====================================================
# 📄 Reportes del paciente - listar (GET) y crear (POST)
# Rutas compatibles con frontend: /patients/{patient_id}/reports
# =====================================================
@router.get("/patients/{patient_id}/reports")
def list_patient_reports(patient_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):

    reports = (
        db.query(Report)
        .filter(Report.patient_id == patient_id,
                Report.psychologist_id == current_user.id)
        .order_by(Report.created_at.desc())
        .all()
    )

    result = []
    for r in reports:
        result.append({
            "id": r.id,
            "motivo": r.motivo_consulta,
            "observaciones": r.analisis_clinico,
            "tecnica": r.tecnicas_aplicadas,
            "recomendaciones": r.recomendaciones_previas,
            "created_at": r.created_at.strftime("%Y-%m-%d %H:%M")
        })

    return result

@router.post("/patients/{patient_id}/reports", tags=["Psychologist", "Patient-compat"])
def create_patient_report(patient_id: int, data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "psychologist":
        raise HTTPException(status_code=403, detail="No autorizado")

    report = Report(
        patient_id = patient_id,
        psychologist_id = current_user.id,
        motivo = data.get("motivo"),
        tecnica = data.get("tecnica"),
        observaciones = data.get("observaciones"),
        resultados = data.get("resultados"),
        conclusiones = data.get("conclusiones"),
        recomendaciones = data.get("recomendaciones"),
        created_at = datetime.utcnow()
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    # generar PDF rápidamente (mismo formato que /psychologist/report)
    reports_dir = "backend/reports"
    os.makedirs(reports_dir, exist_ok=True)
    pdf_path = f"{reports_dir}/reporte_{report.id}.pdf"

    c = canvas.Canvas(pdf_path, pagesize=A4)
    width, height = A4
    c.setFont("Helvetica-Bold", 16)
    c.drawString(60, height - 60, "REPORTE PSICOLÓGICO")
    c.setFont("Helvetica", 10)
    y = height - 100

    patient = db.query(User).filter(User.id == patient_id).first()
    if patient:
        c.drawString(60, y, f"Paciente: {patient.first_name or ''} {patient.last_name or ''}")
        y -= 15
        c.drawString(60, y, f"Email: {patient.email or ''}")
        y -= 20

    for campo, valor in {
        "Motivo": report.motivo,
        "Técnica": report.tecnica,
        "Observaciones": report.observaciones,
        "Resultados": report.resultados,
        "Conclusiones": report.conclusiones,
        "Recomendaciones": report.recomendaciones
    }.items():
        if valor:
            lines = []
            texto = f"{campo}: {valor}"
            while len(texto) > 90:
                lines.append(texto[:90])
                texto = texto[90:]
            lines.append(texto)
            for line in lines:
                if y < 80:
                    c.showPage()
                    y = height - 100
                c.drawString(60, y, line)
                y -= 12
            y -= 8

    c.save()

    return {"message": "Reporte guardado", "report_id": report.id}

# =====================================================
# 📥 Descargar último reporte PDF del paciente (compatibilidad con frontend)
# =====================================================
@router.get("/patients/{patient_id}/reports/download", tags=["Psychologist", "Patient-compat"])
def download_latest_patient_report(patient_id: int, db: Session = Depends(get_db)):
    # buscar último reporte del paciente
    r = db.query(Report).filter(Report.patient_id == patient_id).order_by(Report.created_at.desc()).first()
    if not r:
        raise HTTPException(status_code=404, detail="No se encontraron reportes para el paciente")

    file_path = f"backend/reports/reporte_{r.id}.pdf"
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="El archivo PDF del reporte no existe")
    return FileResponse(file_path, media_type="application/pdf", filename=f"reporte_{r.id}.pdf")

@router.get("/patients/{patient_id}/reports/{report_name}/download")
def download_named_report(patient_id: int, report_name: str, db: Session = Depends(get_db)):
    report = (
        db.query(Report)
        .filter(Report.patient_id == patient_id, Report.motivo == report_name)
        .order_by(Report.created_at.desc())
        .first()
    )

    if not report:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")

    file_path = f"backend/reports/reporte_{report.id}.pdf"
    return FileResponse(file_path, media_type="application/pdf", filename=f"{report_name}.pdf")

@router.post("/psychologist/sessions/{session_id}/report")
def save_report_by_session(
    session_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    data["patient_id"] = data.get("patient_id")
    return save_report(data, db, current_user)

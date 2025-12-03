from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from datetime import datetime
import os
import json

from backend.database import SessionLocal
from backend.models import User, Detection, Report, SessionModel
from backend.main import get_current_user

# PDF + GRÁFICO
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.pagesizes import A4

import matplotlib.pyplot as plt

router = APIRouter(prefix="/psychologist", tags=["Psychologist"])

# ----------------------------
# DB
# ----------------------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# =====================================================
# ✅ GUARDAR REPORTE CLÍNICO DESDE SESIÓN (USADO POR TU room_psico.js)
# POST /psychologist/sessions/{session_id}/report
# =====================================================
@router.post("/sessions/{session_id}/report")
def save_session_report(
    session_id: int,
    data: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    if user.role != "psychologist":
        raise HTTPException(status_code=403, detail="No autorizado")

    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    report = Report(
        session_id=session_id,
        patient_id=data["patient_id"],
        psychologist_id=user.id,

        motivo_consulta=data.get("motivo_consulta"),
        antecedentes=data.get("antecedentes"),
        evolucion=data.get("evolucion"),

        estado_animo=data.get("estado_animo"),
        afecto=data.get("afecto"),
        conducta=data.get("conducta"),
        insight=data.get("insight"),
        pruebas_aplicadas=data.get("pruebas_aplicadas"),

        temas_tratados=data.get("temas_tratados"),
        tecnicas_aplicadas=data.get("tecnicas_aplicadas"),
        actividades=data.get("actividades"),

        analisis_clinico=data.get("analisis_clinico"),
        riesgo_suicida=data.get("riesgo_suicida"),
        riesgo_autolesion=data.get("riesgo_autolesion"),
        riesgo_otros=data.get("riesgo_otros"),

        objetivos=data.get("objetivos"),
        tareas=data.get("tareas"),
        ajustes_tratamiento=data.get("ajustes_tratamiento"),

        pronostico=data.get("pronostico"),
        recomendaciones_previas=data.get("recomendaciones_previas"),
        notas_adicionales=data.get("notas_adicionales"),

        nombre_profesional=data.get("nombre_profesional"),
        licencia_profesional=data.get("licencia_profesional"),

        emociones_detectadas=data.get("emociones_detectadas"),
        created_at=datetime.utcnow()
    )

    db.add(report)
    db.commit()
    db.refresh(report)

    session.status = "finalizada"
    session.ended_at = datetime.utcnow()
    db.commit()

    # ✅ GENERAR PDF CON GRÁFICO
    generar_pdf_con_grafico(report, db)

    return {"message": "✅ Reporte guardado y PDF generado", "report_id": report.id}

# =====================================================
# ✅ LISTAR REPORTES DEL PACIENTE
# GET /patients/{patient_id}/reports
# =====================================================
@router.get("/patients/{patient_id}/reports")
def list_patient_reports(
    patient_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    reports = (
        db.query(Report)
        .filter(
            Report.patient_id == patient_id,
            Report.psychologist_id == user.id
        )
        .order_by(Report.created_at.desc())
        .all()
    )

    return [
        {
            "id": r.id,
            "motivo": r.motivo_consulta,
            "observaciones": r.analisis_clinico,
            "tecnica": r.tecnicas_aplicadas,
            "recomendaciones": r.recomendaciones_previas,
            "created_at": r.created_at.strftime("%Y-%m-%d %H:%M")
        }
        for r in reports
    ]

# =====================================================
# ✅ DESCARGAR REPORTE POR ID
# GET /patients/{patient_id}/reports/{report_id}/download
# =====================================================
from fastapi.responses import StreamingResponse
import io

@router.get("/patients/{patient_id}/reports/{report_id}/download")
def download_report(
    patient_id: int,
    report_id: int,
    db: Session = Depends(get_db)
):
    report = (
        db.query(Report)
        .filter(Report.id == report_id, Report.patient_id == patient_id)
        .first()
    )

    if not report:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")

    buffer = generar_pdf_en_memoria(report, db)

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="reporte_{report.id}.pdf"'
        }
    )

# =====================================================
# ✅ GENERAR PDF + GRÁFICO DE EMOCIONES
# =====================================================
def generar_pdf_en_memoria(report: Report, db: Session):
    buffer = io.BytesIO()
    styles = getSampleStyleSheet()
    story = []

    patient = db.query(User).filter(User.id == report.patient_id).first()

    def campo(titulo, valor):
        if valor:
            story.append(Paragraph(f"<b>{titulo}:</b>", styles["Heading4"]))
            story.append(Paragraph(str(valor), styles["Normal"]))
            story.append(Spacer(1, 8))

    story.append(Paragraph("<b>REPORTE CLÍNICO PSICOLÓGICO</b>", styles["Title"]))
    campo("Paciente", f"{patient.first_name} {patient.last_name}")
    campo("Psicólogo", report.nombre_profesional)
    campo("Licencia", report.licencia_profesional)
    campo("Fecha sesión", report.fecha_sesion)

    campo("Motivo de consulta", report.motivo_consulta)
    campo("Antecedentes", report.antecedentes)
    campo("Evolución", report.evolucion)

    campo("Estado de ánimo", report.estado_animo)
    campo("Afecto", report.afecto)
    campo("Conducta", report.conducta)
    campo("Insight", report.insight)
    campo("Pruebas aplicadas", report.pruebas_aplicadas)

    campo("Temas tratados", report.temas_tratados)
    campo("Técnicas aplicadas", report.tecnicas_aplicadas)
    campo("Actividades", report.actividades)

    campo("Análisis clínico", report.analisis_clinico)
    campo("Riesgo suicida", report.riesgo_suicida)
    campo("Riesgo autolesión", report.riesgo_autolesion)
    campo("Riesgo a otros", report.riesgo_otros)

    campo("Objetivos", report.objetivos)
    campo("Tareas", report.tareas)
    campo("Ajustes", report.ajustes_tratamiento)

    campo("Pronóstico", report.pronostico)
    campo("Recomendaciones", report.recomendaciones_previas)
    campo("Notas adicionales", report.notas_adicionales)

    # ========= GRÁFICO REAL DESDE DETECTIONS =========
    detections = db.query(Detection).filter(
        Detection.patient_id == report.patient_id,
        Detection.psychologist_id == report.psychologist_id
    ).all()

    if detections:
        summary = {}
        for d in detections:
            summary[d.emotion] = summary.get(d.emotion, 0) + 1

        labels = list(summary.keys())
        values = list(summary.values())

        plt.figure()
        plt.bar(labels, values)
        plt.title("Emociones Detectadas")

        img_buffer = io.BytesIO()
        plt.savefig(img_buffer, format="png")
        plt.close()
        img_buffer.seek(0)

        story.append(Spacer(1, 12))
        story.append(Paragraph("Gráfico de Emociones", styles["Heading3"]))
        story.append(Image(img_buffer, width=400, height=250))

    doc = SimpleDocTemplate(buffer, pagesize=A4)
    doc.build(story)
    buffer.seek(0)

    return buffer

# =====================================================
# ✅ EMOCIONES DEL PACIENTE
# =====================================================
@router.get("/patients/{patient_id}/emotions")
def get_patient_emotions(
    patient_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    detections = (
        db.query(Detection)
        .filter(
            Detection.patient_id == patient_id,
            Detection.psychologist_id == user.id
        )
        .all()
    )

    if not detections:
        return {"summary": {}}

    summary = {}
    for d in detections:
        summary[d.emotion] = summary.get(d.emotion, 0) + 1

    total = sum(summary.values())
    porcentajes = {
        k: round((v / total) * 100, 1)
        for k, v in summary.items()
    }

    return {"summary": porcentajes}


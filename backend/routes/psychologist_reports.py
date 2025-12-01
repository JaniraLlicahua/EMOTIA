from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from backend.database import SessionLocal
from backend.models import SessionModel, Report
from backend.main import get_current_user

router = APIRouter(prefix="/psychologist/sessions", tags=["Reports"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ✅ SCHEMA CORREGIDO (ACEPTA TODO TU FRONTEND)
class ReportCreate(BaseModel):
    session_id: int
    patient_id: int
    psychologist_id: Optional[int] = None

    motivo_consulta: Optional[str] = None
    antecedentes: Optional[str] = None
    evolucion: Optional[str] = None

    estado_animo: Optional[str] = None
    afecto: Optional[str] = None
    conducta: Optional[str] = None
    insight: Optional[str] = None
    pruebas_aplicadas: Optional[str] = None

    temas_tratados: Optional[str] = None
    tecnicas_aplicadas: Optional[str] = None
    actividades: Optional[str] = None

    analisis_clinico: Optional[str] = None
    riesgo_suicida: Optional[bool] = False
    riesgo_autolesion: Optional[bool] = False
    riesgo_otros: Optional[bool] = False

    objetivos: Optional[str] = None
    tareas: Optional[str] = None
    ajustes_tratamiento: Optional[str] = None

    pronostico: Optional[str] = None
    proxima_sesion: Optional[str] = None
    recomendaciones_previas: Optional[str] = None
    notas_adicionales: Optional[str] = None

    nombre_profesional: Optional[str] = None
    licencia_profesional: Optional[str] = None
    emociones_detectadas: Optional[str] = None

@router.post("/{session_id}/report")
def save_session_report(
    session_id: int,
    data: ReportCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):

    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    report = Report(
        session_id=session_id,
        patient_id=data.patient_id,
        psychologist_id=user.id,

        motivo_consulta=data.motivo_consulta,
        antecedentes=data.antecedentes,
        evolucion=data.evolucion,

        estado_animo=data.estado_animo,
        afecto=data.afecto,
        conducta=data.conducta,
        insight=data.insight,
        pruebas_aplicadas=data.pruebas_aplicadas,

        temas_tratados=data.temas_tratados,
        tecnicas_aplicadas=data.tecnicas_aplicadas,
        actividades=data.actividades,

        analisis_clinico=data.analisis_clinico,
        riesgo_suicida=data.riesgo_suicida,
        riesgo_autolesion=data.riesgo_autolesion,
        riesgo_otros=data.riesgo_otros,

        objetivos=data.objetivos,
        tareas=data.tareas,
        ajustes_tratamiento=data.ajustes_tratamiento,

        pronostico=data.pronostico,
        proxima_sesion=datetime.fromisoformat(data.proxima_sesion) if data.proxima_sesion else None,
        recomendaciones_previas=data.recomendaciones_previas,
        notas_adicionales=data.notas_adicionales,

        nombre_profesional=data.nombre_profesional,
        licencia_profesional=data.licencia_profesional,

        emociones_detectadas=data.emociones_detectadas,
        fecha_sesion=datetime.utcnow()
    )

    db.add(report)
    db.commit()
    db.refresh(report)

    session.status = "finalizada"
    session.ended_at = datetime.utcnow()
    db.commit()

    return {"message": "✅ Reporte clínico guardado", "report_id": report.id}

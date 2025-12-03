from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Float, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from .database import Base

# =============================
# 👤 USUARIOS
# =============================
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    dni = Column(String, unique=True, nullable=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False)

    first_name = Column(String)
    last_name = Column(String)
    email = Column(String, unique=True)
    gender = Column(String)
    birth_date = Column(DateTime)
    photo_url = Column(String)
    phone = Column(String)
    address = Column(String)
    city = Column(String)
    country = Column(String)

    status = Column(String, default="activo")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    specialty = Column(String)
    license_number = Column(String(100))
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)

    psychologist_patients = relationship(
        "Appointment",
        back_populates="psychologist",
        foreign_keys="Appointment.psychologist_id"
    )
    patient_appointments = relationship(
        "Appointment",
        back_populates="patient",
        foreign_keys="Appointment.patient_id"
    )


# =============================
# 📅 CITAS
# =============================
class Appointment(Base):
    __tablename__ = "appointments"

    id = Column(Integer, primary_key=True, index=True)
    psychologist_id = Column(Integer, ForeignKey("users.id"))
    patient_id = Column(Integer, ForeignKey("users.id"))

    scheduled_at = Column(DateTime, nullable=False)
    status = Column(String, default="pendiente")
    progress = Column(Integer, default=0)
    notes = Column(Text)
    mode = Column(String, default="virtual")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    real_session_id = Column(Integer, nullable=True)

    psychologist = relationship(
        "User",
        foreign_keys=[psychologist_id],
        back_populates="psychologist_patients"
    )

    patient = relationship(
        "User",
        foreign_keys=[patient_id],
        back_populates="patient_appointments"
    )

    appointment_session = relationship(
        "SessionModel",
        back_populates="appointment",
        uselist=False
    )


# =============================
# 🧠 SESIÓN ACTIVA
# =============================
class SessionModel(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    appointment_id = Column(Integer, ForeignKey("appointments.id"))
    started_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    ended_at = Column(DateTime)
    status = Column(String, default="activa")

    # 🔥 SOLO UNA RELACIÓN PERMITIDA
    appointment = relationship(
        "Appointment",
        back_populates="appointment_session"
    )


# =============================
# 💬 MENSAJES
# =============================
class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(Integer, ForeignKey("users.id"))
    receiver_id = Column(Integer, ForeignKey("users.id"))
    session_id = Column(Integer, ForeignKey("sessions.id"))
    content = Column(Text)
    sent_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


# =============================
# 🧾 REPORTES
# =============================
class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)

    # Relaciones principales
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False)
    patient_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    psychologist_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # 1. Datos identificativos
    fecha_sesion = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    numero_sesion = Column(Integer)

    # 2. Motivo de consulta
    motivo_consulta = Column(Text)

    # 3. Antecedentes
    antecedentes = Column(Text)

    # 4. Evolución
    evolucion = Column(Text)

    # 5. Observaciones clínicas
    estado_animo = Column(String(100))
    afecto = Column(String(100))
    conducta = Column(String(100))
    insight = Column(String(100))
    pruebas_aplicadas = Column(Text)

    # 6. Contenido de la sesión
    temas_tratados = Column(Text)
    tecnicas_aplicadas = Column(Text)
    actividades = Column(Text)

    # 7. Análisis clínico
    analisis_clinico = Column(Text)
    riesgo_suicida = Column(Boolean, default=False)
    riesgo_autolesion = Column(Boolean, default=False)
    riesgo_otros = Column(Boolean, default=False)

    # 8. Plan de intervención
    objetivos = Column(Text)
    tareas = Column(Text)
    ajustes_tratamiento = Column(Text)

    # 9. Pronóstico
    pronostico = Column(Text)

    # 10. Próxima sesión
    proxima_sesion = Column(DateTime)
    recomendaciones_previas = Column(Text)
    notas_adicionales = Column(Text)

    # 11. Firma profesional
    nombre_profesional = Column(String(150))
    licencia_profesional = Column(String(100))

    # Emociones detectadas por IA
    emociones_detectadas = Column(Text)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

# =============================
# 😊 DETECCIONES IA
# =============================
class Detection(Base):
    __tablename__ = "detections"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"))
    patient_id = Column(Integer, ForeignKey("users.id"))
    psychologist_id = Column(Integer, ForeignKey("users.id"))
    image_name = Column(String, nullable=False)
    emotion = Column(String, nullable=False)
    confidence = Column(Float, nullable=False)
    detected_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

# backend/models.py
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base

# =============================
# 👤 USUARIOS (admin, psicólogo, paciente)
# =============================
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    dni = Column(String, unique=True, nullable=True)  # Documento nacional
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False)  # admin / psychologist / patient

    # Datos personales
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    email = Column(String, unique=True, nullable=True)
    gender = Column(String, nullable=True)
    birth_date = Column(DateTime, nullable=True)
    photo_url = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    address = Column(String, nullable=True)
    city = Column(String, nullable=True)
    country = Column(String, nullable=True)

    # Estado y metadatos
    status = Column(String, default="activo")  # activo / inactivo / bloqueado
    created_at = Column(DateTime, default=datetime.utcnow)

    # Campos específicos
    specialty = Column(String, nullable=True)  # solo psicólogos
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)  # paciente asignado a psicólogo

    # Relaciones
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
# 📅 CITAS / SESIONES TERAPÉUTICAS
# =============================
class Appointment(Base):
    __tablename__ = "appointments"

    id = Column(Integer, primary_key=True, index=True)
    psychologist_id = Column(Integer, ForeignKey("users.id"))
    patient_id = Column(Integer, ForeignKey("users.id"))
    scheduled_at = Column(DateTime, nullable=False)
    status = Column(String, default="pendiente")  # pendiente, completada, cancelada
    progress = Column(Integer, default=0)  # % de progreso
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relaciones bidireccionales
    psychologist = relationship("User", foreign_keys=[psychologist_id], back_populates="psychologist_patients")
    patient = relationship("User", foreign_keys=[patient_id], back_populates="patient_appointments")

# =============================
# 🧠 SESIÓN ACTIVA EN VIVO
# =============================
class SessionModel(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    appointment_id = Column(Integer, ForeignKey("appointments.id"), nullable=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)
    status = Column(String, default="activa")  # activa / cerrada

    appointment = relationship("Appointment", backref="sessions")

# =============================
# 💬 MENSAJES (chat paciente-psicólogo)
# =============================
class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(Integer, ForeignKey("users.id"))
    receiver_id = Column(Integer, ForeignKey("users.id"))
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=True)
    content = Column(Text)
    sent_at = Column(DateTime, default=datetime.utcnow)

# =============================
# 🧾 REPORTES (generados tras sesiones)
# =============================
class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"))
    psychologist_id = Column(Integer, ForeignKey("users.id"))
    patient_id = Column(Integer, ForeignKey("users.id"))
    summary = Column(Text)
    progress_percent = Column(Integer, default=0)
    status = Column(String, default="activo")
    created_at = Column(DateTime, default=datetime.utcnow)

# =============================
# 😊 DETECCIONES (emociones captadas por la IA)
# =============================
class Detection(Base):
    __tablename__ = "detections"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=True)
    patient_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    psychologist_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    image_name = Column(String, nullable=False)
    emotion = Column(String, nullable=False)
    confidence = Column(String, nullable=False)
    detected_at = Column(DateTime, default=datetime.utcnow)

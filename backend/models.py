from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Float
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
    role = Column(String, nullable=False)  # admin / psychologist / patient

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

    status = Column(String, default="activo")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    specialty = Column(String, nullable=True)
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
# 📅 CITAS / SESIONES TERAPÉUTICAS
# =============================
class Appointment(Base):
    __tablename__ = "appointments"

    id = Column(Integer, primary_key=True, index=True)
    psychologist_id = Column(Integer, ForeignKey("users.id"))
    patient_id = Column(Integer, ForeignKey("users.id"))
    scheduled_at = Column(DateTime, nullable=False)
    status = Column(String, default="pendiente")
    progress = Column(Integer, default=0)
    notes = Column(Text, nullable=True)
    mode = Column(String, default="virtual")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    psychologist = relationship("User", foreign_keys=[psychologist_id], back_populates="psychologist_patients")
    patient = relationship("User", foreign_keys=[patient_id], back_populates="patient_appointments")

# =============================
# 🧠 SESIÓN ACTIVA EN VIVO
# =============================
class SessionModel(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    appointment_id = Column(Integer, ForeignKey("appointments.id"), nullable=True)
    started_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    ended_at = Column(DateTime, nullable=True)
    status = Column(String, default="activa")

    appointment = relationship("Appointment", backref="sessions")

# =============================
# 💬 MENSAJES (chat)
# =============================
class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(Integer, ForeignKey("users.id"))
    receiver_id = Column(Integer, ForeignKey("users.id"))
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=True)
    content = Column(Text)
    sent_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

# =============================
# 🧾 REPORTES
# =============================
class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("users.id"))
    psychologist_id = Column(Integer, ForeignKey("users.id"))
    motivo = Column(String(255))
    tecnica = Column(String(255))
    observaciones = Column(Text)
    resultados = Column(Text)
    conclusiones = Column(Text)
    recomendaciones = Column(Text)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

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
    confidence = Column(Float, nullable=False)
    detected_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

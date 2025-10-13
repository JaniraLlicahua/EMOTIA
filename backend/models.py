# backend/models.py
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)  # nombre de usuario o correo
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False)  # admin / psychologist / patient

    # 🔽 nuevos campos
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    email = Column(String, unique=True, nullable=True)
    status = Column(String, default="activo")  # activo, inactivo, etc.
    photo_url = Column(String, nullable=True)
    birth_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

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
class Appointment(Base):
    __tablename__ = "appointments"

    id = Column(Integer, primary_key=True, index=True)
    psychologist_id = Column(Integer, ForeignKey("users.id"))
    patient_id = Column(Integer, ForeignKey("users.id"))
    scheduled_at = Column(DateTime, nullable=False)
    status = Column(String, default="pendiente")  # pendiente, completada, cancelada
    progress = Column(Integer, default=0)  # % de progreso terapéutico
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    psychologist = relationship("User", foreign_keys=[psychologist_id], back_populates="psychologist_patients")
    patient = relationship("User", foreign_keys=[patient_id], back_populates="patient_appointments")
class SessionModel(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    appointment_id = Column(Integer, ForeignKey("appointments.id"), nullable=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)
    status = Column(String, default="activa")

    appointment = relationship("Appointment")

class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(Integer, ForeignKey("users.id"))
    receiver_id = Column(Integer, ForeignKey("users.id"))
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=True)
    content = Column(Text)
    sent_at = Column(DateTime, default=datetime.utcnow)
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

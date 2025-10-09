# backend/models.py
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False)  # 'admin','psychologist','patient'
    created_at = Column(DateTime, default=datetime.utcnow)

    # relaciones (opcional)
    patients = relationship("Appointment", back_populates="psychologist", foreign_keys="Appointment.psychologist_id")

class Appointment(Base):
    __tablename__ = "appointments"
    id = Column(Integer, primary_key=True, index=True)
    psychologist_id = Column(Integer, ForeignKey("users.id"))
    patient_id = Column(Integer, ForeignKey("users.id"))
    scheduled_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    psychologist = relationship("User", foreign_keys=[psychologist_id])

class SessionModel(Base):
    __tablename__ = "sessions"
    id = Column(Integer, primary_key=True, index=True)
    appointment_id = Column(Integer, ForeignKey("appointments.id"), nullable=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)

class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(Integer, ForeignKey("users.id"))
    receiver_id = Column(Integer, ForeignKey("users.id"))
    content = Column(Text)
    sent_at = Column(DateTime, default=datetime.utcnow)

class Report(Base):
    __tablename__ = "reports"
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"))
    psychologist_id = Column(Integer, ForeignKey("users.id"))
    summary = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

# tu modelo Detection existente (ajusta si ya lo tienes)
class Detection(Base):
    __tablename__ = "detections"
    id = Column(Integer, primary_key=True, index=True)
    image_name = Column(String, nullable=False)
    emotion = Column(String, nullable=False)
    confidence = Column(String, nullable=False)
    detected_at = Column(DateTime, default=datetime.utcnow)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=True)

from sqlalchemy import Column, Integer, String, DateTime
from datetime import datetime
from .database import Base

class Detection(Base):
    __tablename__ = "detections"

    id = Column(Integer, primary_key=True, index=True)
    image_name = Column(String, nullable=False)
    emotion = Column(String, nullable=False)
    confidence = Column(String, nullable=False)
    detected_at = Column(DateTime, default=datetime.utcnow)

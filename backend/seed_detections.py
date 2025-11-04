# backend/seed_detections.py
from backend.database import SessionLocal
from backend.models import Detection
from datetime import datetime, timezone

db = SessionLocal()

print("🌱 Insertando detecciones de emociones de ejemplo...")

detections = [
    Detection(patient_id=3, psychologist_id=2, image_name="img1.jpg", emotion="happy", confidence=0.92, detected_at=datetime.now(timezone.utc)),
    Detection(patient_id=3, psychologist_id=2, image_name="img2.jpg", emotion="sad", confidence=0.75, detected_at=datetime.now(timezone.utc)),
    Detection(patient_id=3, psychologist_id=2, image_name="img3.jpg", emotion="angry", confidence=0.60, detected_at=datetime.now(timezone.utc)),
    Detection(patient_id=3, psychologist_id=2, image_name="img4.jpg", emotion="happy", confidence=0.88, detected_at=datetime.now(timezone.utc)),
    Detection(patient_id=3, psychologist_id=2, image_name="img5.jpg", emotion="neutral", confidence=0.70, detected_at=datetime.now(timezone.utc)),
]

db.add_all(detections)
db.commit()
db.close()

print("✅ Detecciones insertadas correctamente.")

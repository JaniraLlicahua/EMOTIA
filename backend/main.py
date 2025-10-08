# backend/main.py
import os
import json
from pathlib import Path
from datetime import datetime

import numpy as np
import cv2

from dotenv import load_dotenv
load_dotenv()  # 🔥 Carga automáticamente las variables desde .env

from fastapi import FastAPI, Depends, HTTPException, File, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from .database import SessionLocal
from .models import Detection

app = FastAPI(title="EMOTIA Backend")

# ---------- DB dependency ----------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ---------- Pydantic models ----------
class DetectionCreate(BaseModel):
    image_name: str
    emotion: str
    confidence: float

class DetectionOut(BaseModel):
    id: int
    image_name: str
    emotion: str
    confidence: float
    detected_at: datetime

    class Config:
        orm_mode = True

# ---------- Basic routes ----------
@app.get("/")
def root():
    return {"message": "🚀 Backend EMOTIA conectado a PostgreSQL correctamente"}

@app.post("/detections", response_model=DetectionOut)
def save_detection(payload: DetectionCreate, db: Session = Depends(get_db)):
    new_detection = Detection(
        image_name=payload.image_name,
        emotion=payload.emotion,
        confidence=str(payload.confidence)
    )
    db.add(new_detection)
    db.commit()
    db.refresh(new_detection)
    return new_detection

@app.get("/detections", response_model=list[DetectionOut])
def list_detections(db: Session = Depends(get_db)):
    detections = db.query(Detection).order_by(Detection.id.desc()).all()
    return detections

# ---------- Load model and class names ----------

# Path to model and class indices (adjust if your structure differs)
ROOT = Path(__file__).resolve().parents[1]  # proyecto raíz
MODEL_PATH = ROOT / "ia" / "models" / "best_model.keras"
CLASS_IDX_PATH = ROOT / "ia" / "models" / "class_indices.json"

# Load class names (index -> label)
if CLASS_IDX_PATH.exists():
    with open(CLASS_IDX_PATH, 'r', encoding='utf-8') as f:
        CLASS_NAMES = json.load(f)
else:
    # fallback; usa este orden si no tienes el json
    CLASS_NAMES = ['angry','disgust','fear','happy','neutral','sad','surprise']

# Load Keras model (compile=False es suficiente para inferencia)
from tensorflow.keras.models import load_model
if not MODEL_PATH.exists():
    raise FileNotFoundError(f"Modelo no encontrado en: {MODEL_PATH}")
emotion_model = load_model(str(MODEL_PATH), compile=False)

# Load Haar cascade for face detection
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

def preprocess_image_for_model(img_path):
    """
    Lee imagen, detecta primer rostro (si existe), recorta y devuelve array (1,48,48,1)
    """
    img = cv2.imread(str(img_path))
    if img is None:
        raise ValueError("No se pudo leer la imagen con OpenCV.")
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30,30))
    if len(faces) > 0:
        x,y,w,h = faces[0]
        roi = gray[y:y+h, x:x+w]
    else:
        # Si no detecta rostros, hacemos crop centrado cuadrado
        h_img, w_img = gray.shape
        m = min(h_img, w_img)
        startx = w_img//2 - m//2
        starty = h_img//2 - m//2
        roi = gray[starty:starty+m, startx:startx+m]

    roi = cv2.resize(roi, (48,48))
    roi = roi.astype('float32') / 255.0
    roi = np.expand_dims(roi, axis=-1)   # (48,48,1)
    roi = np.expand_dims(roi, axis=0)    # (1,48,48,1)
    return roi

# ---------- Predict endpoint ----------
@app.post("/predict")
async def predict_emotion(file: UploadFile = File(...), db: Session = Depends(get_db)):
    # 1) Guardar temporal
    temp_path = Path(f"temp_{file.filename}")
    try:
        contents = await file.read()
        temp_path.write_bytes(contents)

        # 2) Preprocesar (detecta y recorta la cara)
        img_array = preprocess_image_for_model(str(temp_path))

        # 3) Predicción
        preds = emotion_model.predict(img_array)
        predicted_index = int(np.argmax(preds[0]))
        emotion_label = CLASS_NAMES[predicted_index]
        confidence = float(np.max(preds[0]))

        # 4) Guardar en BD
        new_detection = Detection(
            image_name=file.filename,
            emotion=emotion_label,
            confidence=str(confidence)
        )
        db.add(new_detection)
        db.commit()
        db.refresh(new_detection)

        # 5) Respuesta
        return {
            "image_name": file.filename,
            "emotion": emotion_label,
            "confidence": confidence,
            "detection_id": new_detection.id
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        # asegurar eliminación de archivo temporal
        if temp_path.exists():
            try:
                temp_path.unlink()
            except Exception:
                pass

# ---------- Stats endpoints ----------
@app.get("/stats/emotions")
def stats_emotions(db: Session = Depends(get_db)):
    rows = db.query(Detection.emotion, func.count(Detection.id)).group_by(Detection.emotion).all()
    return {emotion: count for emotion, count in rows}

@app.get("/detections/filter", response_model=list[DetectionOut])
def detections_filter(emotion: str = None, db: Session = Depends(get_db)):
    q = db.query(Detection)
    if emotion:
        q = q.filter(Detection.emotion == emotion)
    return q.order_by(Detection.id.desc()).all()

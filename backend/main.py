# backend/main.py
import os
import json
import base64
from pathlib import Path
from datetime import datetime
from . import models, database

import numpy as np
import cv2
from dotenv import load_dotenv

from fastapi import FastAPI, Depends, HTTPException, File, UploadFile, Security, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from .database import SessionLocal
from .models import User, Detection, SessionModel

# 📌 Ruta raíz del proyecto (EMOTIA/)
ROOT = Path(__file__).resolve().parents[1]

# ========================
# 🌱 Cargar variables de entorno
# ========================
load_dotenv()

# ========================
# 🚀 Inicializar FastAPI
# ========================
app = FastAPI(title="🚀 EMOTIA Backend")

# ========================
# 🌍 Configuración CORS
# ========================
from fastapi.middleware.cors import CORSMiddleware

# Permitir llamadas desde tu frontend (PyQt y navegador local)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # puedes restringir a "http://127.0.0.1:5500" si quieres
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ========================
# 🗄️ Conexión BD
# ========================
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ========================
# 🔐 Autenticación (Registro y Login con JWT)
# ========================
from passlib.context import CryptContext
import jwt

SECRET_KEY = os.getenv("SECRET_KEY", "clave-super-secreta")  # ⚠️ cámbiala y guárdala en .env
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

def get_password_hash(password: str):
    # bcrypt soporta hasta 72 bytes → truncamos para evitar errores
    if len(password) > 72:
        password = password[:72]
    return pwd_context.hash(password)

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict):
    return jwt.encode(data, SECRET_KEY, algorithm=ALGORITHM)

# 📌 Pydantic para Registro/Login
class RegisterPayload(BaseModel):
    username: str
    password: str
    role: str = "patient"  # admin / psychologist / patient

class LoginPayload(BaseModel):
    email: str
    password: str

# 📌 Endpoint para registrar usuario
@app.post("/register")
def register_user(payload: RegisterPayload, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.username == payload.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Usuario ya existe")
    user = User(
        username=payload.username,
        password_hash=get_password_hash(payload.password),
        role=payload.role
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"id": user.id, "username": user.username, "role": user.role}

# 📌 Endpoint para login (devuelve JWT)
@app.post("/login")
def login(payload: LoginPayload, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Credenciales inválidas")

    token = create_access_token({"sub": user.email, "role": user.role, "user_id": user.id})

    return {
        "access_token": token,
        "token_type": "bearer",
        "role": user.role,
        "email": user.email,
        "username": user.username
    }

# 📌 Dependencia para obtener usuario actual desde token
def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security), db: Session = Depends(get_db)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido")
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    return user

# ========================
# 📝 Modelos Pydantic detecciones
# ========================
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
        from_attributes = True  # ⚠️ Pydantic v2

# ========================
# 🌐 Rutas básicas
# ========================
@app.get("/")
def root():
    return {"message": "🚀 Backend EMOTIA conectado correctamente a la BD y al modelo IA"}

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
    return db.query(Detection).order_by(Detection.id.desc()).all()

# ========================
# 🧠 Carga del modelo IA
# ========================
from tensorflow.keras.models import load_model

MODEL_PATH = ROOT / "ia" / "models" / "best_model.keras"
CLASS_IDX_PATH = ROOT / "ia" / "models" / "class_indices.json"

if not MODEL_PATH.exists():
    raise FileNotFoundError(f"❌ Modelo no encontrado en: {MODEL_PATH}")

model = load_model(str(MODEL_PATH), compile=False)

if CLASS_IDX_PATH.exists():
    with open(CLASS_IDX_PATH, "r", encoding="utf-8") as f:
        class_indices = json.load(f)
    CLASS_NAMES = [class_indices[str(i)] for i in range(len(class_indices))]
else:
    CLASS_NAMES = ['angry','disgust','fear','happy','neutral','sad','surprise']

print("✅ Modelo cargado. Clases:", CLASS_NAMES)

face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

# ========================
# 🧼 Preprocesamiento de imágenes
# ========================
def preprocess_image_for_model(img_path: str):
    img = cv2.imread(str(img_path))
    if img is None:
        raise ValueError("No se pudo leer la imagen con OpenCV.")
    
    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))
    if len(faces) > 0:
        x, y, w, h = faces[0]
        roi = img_rgb[y:y+h, x:x+w]
    else:
        h_img, w_img, _ = img_rgb.shape
        m = min(h_img, w_img)
        sx = w_img // 2 - m // 2
        sy = h_img // 2 - m // 2
        roi = img_rgb[sy:sy+m, sx:sx+m]

    roi = cv2.resize(roi, (96, 96)).astype("float32") / 255.0
    roi = np.expand_dims(roi, axis=0)  # (1, 96, 96, 3)
    return roi

# ========================
# 🎯 Endpoint /predict
# ========================
@app.post("/predict")
async def predict_emotion(file: UploadFile = File(...), db: Session = Depends(get_db)):
    temp_path = Path(f"temp_{file.filename}")
    try:
        contents = await file.read()
        temp_path.write_bytes(contents)
        img_array = preprocess_image_for_model(str(temp_path))
        preds = model.predict(img_array, verbose=0)[0]
        idx = int(np.argmax(preds))
        emotion = CLASS_NAMES[idx]
        confidence = float(preds[idx])

        new_detection = Detection(
            image_name=file.filename,
            emotion=emotion,
            confidence=str(confidence)
        )
        db.add(new_detection)
        db.commit()
        db.refresh(new_detection)

        return {
            "image_name": file.filename,
            "emotion": emotion,
            "confidence": confidence,
            "detection_id": new_detection.id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if temp_path.exists():
            temp_path.unlink()

# ========================
# 📊 Endpoints de estadísticas
# ========================
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

# ========================
# 📆 Endpoint para crear sesiones
# ========================
@app.post("/sessions")
def create_session(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Solo psicólogos pueden crear sesiones
    if current_user.role != "psychologist":
        raise HTTPException(status_code=403, detail="Solo psicólogos pueden iniciar sesiones")

    session = SessionModel(appointment_id=None)
    db.add(session)
    db.commit()
    db.refresh(session)
    return {"session_id": session.id, "started_at": session.started_at.isoformat()}

# ========================
# 🌐 WebSocket para predicción en vivo
# ========================
SESSION_CLIENTS: dict[int, set] = {}

def predict_from_bytes(frame_bytes: bytes):
    arr = np.frombuffer(frame_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        return None
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30,30))
    if len(faces) > 0:
        x, y, w, h = faces[0]
        roi = gray[y:y+h, x:x+w]
    else:
        h_img, w_img = gray.shape
        m = min(h_img, w_img)
        sx = w_img // 2 - m // 2
        sy = h_img // 2 - m // 2
        roi = gray[sy:sy+m, sx:sx+m]
    roi = cv2.resize(roi, (48,48)).astype("float32") / 255.0
    roi = np.expand_dims(np.expand_dims(roi, -1), 0)
    preds = model.predict(roi, verbose=0)[0]
    idx = int(np.argmax(preds))
    return {"emotion": CLASS_NAMES[idx], "confidence": float(preds[idx])}

@app.websocket("/ws/predict/{session_id}")
async def ws_predict(websocket: WebSocket, session_id: int):
    await websocket.accept()
    sid = int(session_id)
    if sid not in SESSION_CLIENTS:
        SESSION_CLIENTS[sid] = set()
    SESSION_CLIENTS[sid].add(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            if data.get("type") == "frame":
                b64 = data.get("data").split(",")[-1]
                frame_bytes = base64.b64decode(b64)
                pred = predict_from_bytes(frame_bytes)
                if pred:
                    payload = {"type": "prediction", **pred}
                    for client in list(SESSION_CLIENTS.get(sid, [])):
                        try:
                            await client.send_json(payload)
                        except Exception:
                            SESSION_CLIENTS[sid].discard(client)
    except WebSocketDisconnect:
        SESSION_CLIENTS[sid].discard(websocket)

# ========================
# 🌐 Servir frontend (HTML estático)
# ========================
FRONTEND_DIR = ROOT / "frontend"
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")

# 👇 al final de backend/main.py
import backend.models as models
from backend.database import engine

models.Base.metadata.create_all(bind=engine)

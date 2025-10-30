import os
import json
import base64
from pathlib import Path
from datetime import datetime, timedelta

import numpy as np
import cv2
import jwt
from dotenv import load_dotenv
from fastapi import FastAPI, Depends, HTTPException, File, UploadFile, Security, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func
from passlib.context import CryptContext

from backend.database import SessionLocal
from backend.models import User, Detection, SessionModel

# ========================
# 🌱 Configuración inicial
# ========================
load_dotenv()
ROOT = Path(__file__).resolve().parents[1]

app = FastAPI(title="🚀 EMOTIA Backend")

# ========================
# 🌍 CORS (para permitir tu frontend y PyQt)
# ========================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Puedes restringir luego a dominios específicos
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ========================
# 🔐 Autenticación con JWT
# ========================
SECRET_KEY = os.getenv("SECRET_KEY", "clave-super-secreta")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_password_hash(password: str):
    if len(password) > 72:
        password = password[:72]
    return pwd_context.hash(password)


def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict):
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    data.update({"exp": expire})
    return jwt.encode(data, SECRET_KEY, algorithm=ALGORITHM)


# ========================
# 📌 Modelos Pydantic
# ========================
class LoginPayload(BaseModel):
    email: str
    password: str


class RegisterPayload(BaseModel):
    username: str
    email: str
    password: str
    role: str = "patient"

# ========================
# 🚪 Login por correo
# ========================
@app.post("/login")
def login(payload: LoginPayload, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user:
        raise HTTPException(status_code=401, detail="Correo no encontrado")

    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Contraseña incorrecta")

    token = create_access_token({"sub": user.email, "role": user.role, "user_id": user.id})

    return {
        "access_token": token,
        "token_type": "bearer",
        "role": user.role,
        "email": user.email,
        "username": user.username,
        "user_id": user.id,
    }

# ========================
# 👤 Registrar usuario (opcional)
# ========================
@app.post("/register")
def register(payload: RegisterPayload, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="El correo ya está registrado")

    user = User(
        username=payload.username,
        email=payload.email,
        password_hash=get_password_hash(payload.password),
        role=payload.role,
        status="activo",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"id": user.id, "email": user.email, "role": user.role}


# ========================
# 🔐 Obtener usuario actual
# ========================
def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security), db: Session = Depends(get_db)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido")

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    return user


# ========================
# 📸 IA y Detecciones
# ========================
@app.get("/")
def root():
    return {"message": "🚀 Backend EMOTIA activo y conectado correctamente"}


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
        from_attributes = True


@app.post("/detections", response_model=DetectionOut)
def save_detection(payload: DetectionCreate, db: Session = Depends(get_db)):
    new_detection = Detection(
        image_name=payload.image_name,
        emotion=payload.emotion,
        confidence=str(payload.confidence),
    )
    db.add(new_detection)
    db.commit()
    db.refresh(new_detection)
    return new_detection


@app.get("/detections", response_model=list[DetectionOut])
def list_detections(db: Session = Depends(get_db)):
    return db.query(Detection).order_by(Detection.id.desc()).all()


# ========================
# 📆 Crear sesiones
# ========================
@app.post("/sessions")
def create_session(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "psychologist":
        raise HTTPException(status_code=403, detail="Solo psicólogos pueden iniciar sesiones")

    session = SessionModel(appointment_id=None)
    db.add(session)
    db.commit()
    db.refresh(session)
    return {"session_id": session.id, "started_at": session.started_at.isoformat()}


# ========================
# 🌐 WebSocket IA (stream)
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
    CLASS_NAMES = ['angry', 'disgust', 'fear', 'happy', 'neutral', 'sad', 'surprise']

face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")


def predict_from_bytes(frame_bytes: bytes):
    arr = np.frombuffer(frame_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        return None
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))
    if len(faces) > 0:
        x, y, w, h = faces[0]
        roi = gray[y:y + h, x:x + w]
    else:
        h_img, w_img = gray.shape
        m = min(h_img, w_img)
        sx = w_img // 2 - m // 2
        sy = h_img // 2 - m // 2
        roi = gray[sy:sy + m, sx:sx + m]
    roi = cv2.resize(roi, (48, 48)).astype("float32") / 255.0
    roi = np.expand_dims(np.expand_dims(roi, -1), 0)
    preds = model.predict(roi, verbose=0)[0]
    idx = int(np.argmax(preds))
    return {"emotion": CLASS_NAMES[idx], "confidence": float(preds[idx])}


SESSION_CLIENTS: dict[int, set] = {}


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

# Importar routers (mantener como antes)
from backend.routes import admin
from backend.routes import admin_reports
from backend.routes import psychologist_reports
from backend.routes import psychologist
from backend.routes import chat_ws, chat_rest
from backend.routes import meetings

# 🟢 Montar los routers de la API PRIMERO
app.include_router(admin.router)
app.include_router(admin_reports.router)
app.include_router(psychologist_reports.router)
app.include_router(psychologist.router)
app.include_router(chat_ws.router)
app.include_router(chat_rest.router)
app.include_router(meetings.router)

# 🟢 Servir la carpeta frontend bajo /static para evitar colisiones con la API
FRONTEND_DIR = ROOT / "app_desktop" / "views"
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static_frontend")

# Redirigir root (/) al login dentro de /static
from fastapi.responses import RedirectResponse

@app.get("/", include_in_schema=False)
def redirect_to_frontend():
    # Si quieres cambiar el html por defecto, ajusta la ruta abajo
    return RedirectResponse(url="/static/html/login.html")
# -------------------------------------------------------

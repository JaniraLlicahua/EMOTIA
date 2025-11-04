# backend/routes/sessions.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from backend.database import SessionLocal
from backend.models import SessionModel, Appointment, User
from backend.main import get_current_user

router = APIRouter(prefix="/sessions", tags=["Sessions"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/")
def create_session(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Crea una sesión activa para una reunión actual"""
    if current_user.role != "psychologist":
        raise HTTPException(status_code=403, detail="Solo psicólogos pueden iniciar sesiones")
    
    session = SessionModel(
        psychologist_id=current_user.id,
        started_at=datetime.utcnow(),
        status="activa"
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return {"session_id": session.id, "message": "Sesión creada"}

# backend/routes/users.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database import SessionLocal
from backend.models import User
from backend.main import get_current_user

router = APIRouter(prefix="/users", tags=["Users"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("/{user_id}")
def get_user(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Devuelve la información completa de un usuario"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "birth_date": user.birth_date.isoformat() if user.birth_date else None,
        "phone": getattr(user, "phone", None),
        "address": getattr(user, "address", None),
        "photo_url": getattr(user, "photo_url", None),
        "status": user.status,
        "role": user.role,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }

@router.get("")
def list_users_by_role(role: str, db: Session = Depends(get_db)):
    if role != "psychologist":
        return []

    users = db.query(User).filter(User.role == "psychologist").all()

    return [
        {
            "id": u.id,
            "full_name": f"{u.first_name} {u.last_name}",
            "email": u.email
        } for u in users
    ]

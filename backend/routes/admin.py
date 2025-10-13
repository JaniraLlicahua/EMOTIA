# backend/routes/admin.py
from backend.utils.security import get_password_hash
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import SessionLocal
from ..models import User, Report
from datetime import datetime

router = APIRouter(prefix="/admin", tags=["Admin"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# 🔹 Listar todos los usuarios (pacientes o psicólogos)
@router.get("/users")
def list_users(role: str = None, db: Session = Depends(get_db)):
    q = db.query(User)
    if role:
        q = q.filter(User.role == role)
    users = q.order_by(User.id).all()
    return [
        {
            "id": u.id,
            "nombre": f"{u.first_name or ''} {u.last_name or ''}".strip(),
            "email": u.email,
            "estado": u.status,
            "rol": u.role,
            "fecha": u.created_at.strftime("%Y-%m-%d")
        }
        for u in users
    ]

# 🔹 Crear nuevo usuario
@router.post("/users")
def create_user(data: dict, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == data.get("email")).first()
    if existing:
        raise HTTPException(status_code=400, detail="Correo ya registrado")

    new_user = User(
        username=data["email"],
        email=data["email"],
        password_hash=get_password_hash(data["password"]),
        role=data["role"],
        first_name=data.get("first_name"),
        last_name=data.get("last_name"),
        status="activo"
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"id": new_user.id, "email": new_user.email}

# 🔹 Eliminar usuario
@router.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    db.delete(user)
    db.commit()
    return {"ok": True}

# 🔹 Obtener métricas de reportes
@router.get("/reports/stats")
def reports_stats(db: Session = Depends(get_db)):
    total_reports = db.query(Report).count()
    total_users = db.query(User).count()
    psicologos = db.query(User).filter(User.role == "psychologist").count()
    pacientes = db.query(User).filter(User.role == "patient").count()

    return {
        "total_reportes": total_reports,
        "total_usuarios": total_users,
        "psicologos": psicologos,
        "pacientes": pacientes,
    }

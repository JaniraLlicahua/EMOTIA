# backend/routes/admin.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database import SessionLocal
from backend.models import User
from backend.main import get_current_user

router = APIRouter(prefix="/admin", tags=["Admin"])

# Dependencia para obtener la sesión de BD
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ================================
# 👥 Obtener todos los pacientes
# ================================
@router.get("/patients")
def get_all_patients(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="No autorizado")

    patients = db.query(User).filter(User.role == "patient").all()
    return [
        {
            "id": u.id,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "email": u.email,
            "status": u.status,
            "created_at": u.created_at.strftime("%d/%m/%Y") if u.created_at else None,
        }
        for u in patients
    ]

# ================================
# ➕ Añadir nuevo paciente
# ================================
@router.post("/patients")
def add_patient(data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="No autorizado")

    from backend.main import get_password_hash

    email = data.get("email")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="Correo ya registrado")

    user = User(
        first_name=data.get("first_name"),
        last_name=data.get("last_name"),
        email=email,
        username=email,  # usamos el email también como username
        password_hash=get_password_hash(data.get("password", "123456")),
        role="patient",
        status=data.get("status", "activo"),
    )

    db.add(user)
    db.commit()
    db.refresh(user)
    return {"message": "Paciente creado exitosamente", "id": user.id}

# ================================
# 🔗 Asignar paciente a un psicólogo
# ================================
@router.post("/assign_patient")
def assign_patient(data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="No autorizado")

    patient_id = data.get("patient_id")
    psychologist_id = data.get("psychologist_id")

    if not patient_id or not psychologist_id:
        raise HTTPException(status_code=400, detail="Faltan campos requeridos")

    patient = db.query(User).filter(User.id == patient_id, User.role == "patient").first()
    psychologist = db.query(User).filter(User.id == psychologist_id, User.role == "psychologist").first()

    if not patient:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    if not psychologist:
        raise HTTPException(status_code=404, detail="Psicólogo no encontrado")

    # 🔗 Asignar
    patient.assigned_to = psychologist.id
    db.commit()

    return {"message": f"Paciente {patient.first_name} asignado a {psychologist.first_name}"}

# ================================
# ❌ Eliminar paciente
# ================================
@router.delete("/patients/{patient_id}")
def delete_patient(patient_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="No autorizado")

    user = db.query(User).filter(User.id == patient_id, User.role == "patient").first()
    if not user:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")

    db.delete(user)
    db.commit()
    return {"message": "Paciente eliminado correctamente"}

# ================================
# 👩‍⚕️ Obtener todos los psicólogos
# ================================
@router.get("/psychologists")
def get_all_psychologists(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="No autorizado")

    psychologists = db.query(User).filter(User.role == "psychologist").all()
    return [
        {
            "id": u.id,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "email": u.email,
            "phone": u.phone,
            "specialty": u.specialty,
            "status": u.status,
            "created_at": u.created_at.strftime("%d/%m/%Y") if u.created_at else None,
        }
        for u in psychologists
    ]


# ================================
# ➕ Añadir nuevo psicólogo
# ================================
@router.post("/psychologists")
def add_psychologist(data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="No autorizado")

    from backend.main import get_password_hash

    email = data.get("email")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="Correo ya registrado")

    psy = User(
        first_name=data.get("first_name"),
        last_name=data.get("last_name"),
        email=email,
        username=email,
        phone=data.get("phone"),
        password_hash=get_password_hash(data.get("password", "psico123")),
        role="psychologist",
        status=data.get("status", "activo"),
        specialty=data.get("specialty", "General"),
    )

    db.add(psy)
    db.commit()
    db.refresh(psy)
    return {"message": "Psicólogo creado exitosamente", "id": psy.id}


# ================================
# ❌ Eliminar psicólogo
# ================================
@router.delete("/psychologists/{psy_id}")
def delete_psychologist(psy_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="No autorizado")

    psy = db.query(User).filter(User.id == psy_id, User.role == "psychologist").first()
    if not psy:
        raise HTTPException(status_code=404, detail="Psicólogo no encontrado")

    db.delete(psy)
    db.commit()
    return {"message": "Psicólogo eliminado correctamente"}


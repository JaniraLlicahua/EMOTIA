# backend/seed_data.py
from backend.database import SessionLocal
from backend.models import User
from backend.main import get_password_hash

db = SessionLocal()

# Verificar si ya hay usuarios
if db.query(User).count() == 0:
    admin = User(
        username="admin",
        password_hash=get_password_hash("admin123"),
        role="admin",
        first_name="Administrador",
        last_name="General",
        email="admin@emotia.com",
        status="activo"
    )
    psy = User(
        username="psicologo",
        password_hash=get_password_hash("psico123"),
        role="psychologist",
        first_name="Luis",
        last_name="García",
        email="lgarcia@emotia.com",
        specialty="Terapia Cognitiva",
        status="activo"
    )
    patient = User(
        username="paciente",
        password_hash=get_password_hash("paciente123"),
        role="patient",
        first_name="Ana",
        last_name="Torres",
        email="ana@emotia.com",
        status="activo"
    )

    db.add_all([admin, psy, patient])
    db.commit()
    print("✅ Usuarios iniciales creados.")
else:
    print("⚠️ Ya existen usuarios, no se insertaron datos.")

db.close()

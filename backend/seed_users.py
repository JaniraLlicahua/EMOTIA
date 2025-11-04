# backend/seed_users.py
from backend.database import SessionLocal
from backend.models import User
from backend.main import get_password_hash
from datetime import datetime

db = SessionLocal()

print("🌱 Insertando usuarios de ejemplo...")

# Limpiar usuarios previos (opcional, descomenta si deseas reiniciar)
# db.query(User).delete()
# db.commit()

# Verificar si ya hay usuarios registrados
if db.query(User).count() == 0:
    # === Usuario Admin ===
    admin = User(
        username="admin",
        password_hash=get_password_hash("admin123"),
        role="admin",
        first_name="Administrador",
        last_name="General",
        email="admin@emotia.com",
        status="activo",
        created_at=datetime.utcnow()
    )

    # === Psicólogo ===
    psy = User(
        username="psicologo",
        password_hash=get_password_hash("psico123"),
        role="psychologist",
        first_name="Luis",
        last_name="García",
        email="lgarcia@emotia.com",
        specialty="Terapia Cognitiva",
        status="activo",
        created_at=datetime.utcnow()
    )

    # === Paciente asignado al psicólogo ===
    patient = User(
        username="paciente",
        password_hash=get_password_hash("paciente123"),
        role="patient",
        first_name="Ana",
        last_name="Torres",
        email="ana@emotia.com",
        assigned_to=2,  # ID del psicólogo
        status="activo",
        created_at=datetime.utcnow()
    )

    # Guardar todos
    db.add_all([admin, psy, patient])
    db.commit()

    print("✅ Usuarios iniciales creados correctamente.")
else:
    print("⚠️ Ya existen usuarios, no se insertaron datos nuevos.")

db.close()

# backend/seed_users.py
from backend.database import SessionLocal
from backend.models import User
from backend.main import get_password_hash

db = SessionLocal()

# Lista de usuarios base
users = [
    User(
        username="admin",
        email="admin@emotia.com",
        password_hash=get_password_hash("admin123"),
        role="admin",
        first_name="Admin",
        last_name="General"
    ),
    User(
        username="psico1",
        email="psico1@emotia.com",
        password_hash=get_password_hash("psico123"),
        role="psychologist",
        first_name="Ana",
        last_name="Torres"
    ),
    User(
        username="paciente1",
        email="paciente1@emotia.com",
        password_hash=get_password_hash("paciente123"),
        role="patient",
        first_name="Luis",
        last_name="Ramos"
    )
]

for u in users:
    exists = db.query(User).filter(User.username == u.username).first()
    if not exists:
        db.add(u)
        print(f"✅ Usuario creado: {u.username}")
    else:
        print(f"⚠️ Usuario ya existe: {u.username}")

db.commit()
db.close()
print("🎉 Usuarios iniciales cargados correctamente.")

# backend/utils/security.py
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password: str):
    if len(password) > 72:
        password = password[:72]
    return pwd_context.hash(password)

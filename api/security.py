from passlib.context import CryptContext
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
import os
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parent / ".env")
SECRET_KEY = os.environ.get("SECRET_KEY", "")
if not SECRET_KEY:
    raise EnvironmentError("SECRET_KEY error")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict) -> str:
    user = data.get("sub")
    exp = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {"sub": user, "exp": exp}
    token = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return token

def decode_access_token(token: str) -> dict | None:
    try:
        decoded = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return decoded
    except JWTError:
        return None
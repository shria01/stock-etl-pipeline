import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from pathlib import Path

load_dotenv(Path(__file__).resolve().parent / ".env")
DATABASE_URL = os.environ.get("DATABASE_URL", "")

if not DATABASE_URL:
    raise EnvironmentError("DATABASE_URL error")

engine = create_engine(DATABASE_URL, pool_pre_ping=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
from pydantic import BaseModel, EmailStr
from datetime import datetime

class UserCreate(BaseModel):
    email: EmailStr
    password: str


class UserPublic(BaseModel):
    id: int
    email: str
    created_at: datetime

    class Config:
        from_attributes = True

class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class PredictionRequest(BaseModel):
    drop_event_id: int
    session_id: str | None = None

class PredictionResponse(BaseModel):
    probability: float
    threshold: float
    predicted_fast_recovery: bool
    drop_event_id: int
    ticker: str
    sector: str | None

class PredictionHistoryItem(BaseModel):
    id: int
    sector: str | None
    drop_pct: float
    predicted_probability: float
    model_version: str
    created_at: datetime

    class Config:
            from_attributes = True




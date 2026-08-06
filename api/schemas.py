from pydantic import BaseModel, EmailStr, Field
from datetime import datetime

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


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
    model_version: str
    relative_drop_pct: float | None
    max_drawdown_pct: float | None
    distance_from_52w_high: float | None
    volatility_90d: float | None
    sector_relative_drop_pct: float | None
    prior_90d_return: float | None 

class PredictionHistoryItem(BaseModel):
    id: int
    drop_event_id: int | None
    sector: str | None
    drop_pct: float
    predicted_probability: float
    model_version: str
    created_at: datetime

    class Config:
            from_attributes = True




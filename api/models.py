from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Float, Table
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from api.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    predictions = relationship("Prediction", back_populates="user")


drop_events = Table(
    "drop_events",
    Base.metadata,
    Column("id", Integer, primary_key=True),
)
class Prediction(Base):
    __tablename__ = "predictions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    session_id = Column(String, nullable=True, index=True)
    drop_event_id = Column(Integer, ForeignKey("drop_events.id"), nullable=True, index=True)

    sector = Column(String, nullable=True)
    drop_pct = Column(Float, nullable=True)

    predicted_probability = Column(Float, nullable=False)
    model_version = Column(String, nullable=False, default="logreg_v1")

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="predictions")
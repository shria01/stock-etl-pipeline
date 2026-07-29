from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from api.database import get_db
from api.models import User, Prediction
from api.schemas import UserCreate, UserPublic, UserLogin, Token, PredictionRequest, PredictionResponse, PredictionHistoryItem
from api.security import hash_password, verify_password, create_access_token, decode_access_token
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import text
from ml.predict_recovery import predict_recovery

app = FastAPI()

@app.post("/api/register", response_model=UserPublic)
def register(user: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == user.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    hashed = hash_password(user.password)

    new_user = User(email=user.email, password_hash=hashed)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@app.post("/api/login", response_model=Token)
def login(credentials: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == credentials.email).first()
    if not user or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    token = create_access_token({"sub": str(user.id)})
    return {"access_token": token, "token_type": "bearer"}

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/login")
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/api/login", auto_error=False)
def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return user

def get_current_user_optional(
    token: str | None = Depends(oauth2_scheme_optional),
    db: Session = Depends(get_db),
) -> User | None:
    if token is None:
        return None
    payload = decode_access_token(token)
    if payload is None:
        return None
    user_id = payload.get("sub")
    if user_id is None:
        return None
    return db.query(User).filter(User.id == int(user_id)).first()


@app.get("/api/me", response_model=UserPublic)
def read_me(current_user: User = Depends(get_current_user)):
    return current_user

@app.post("/api/predict", response_model=PredictionResponse)
def predict(request: PredictionRequest, db: Session = Depends(get_db), current_user: User | None = Depends(get_current_user_optional)):
    query = text("""
        SELECT de.ticker, s.sector, de.drop_pct, de.max_drawdown_pct,
               de.volatility_90d, de.prior_90d_return, de.volume_change_pct,
               de.distance_from_52w_high, de.relative_drop_pct,
               de.relative_prior_90d_return, de.sector_relative_drop_pct
        FROM drop_events de
        JOIN symbols s ON de.ticker = s.ticker
        WHERE de.id = :event_id
    """)

    result = db.execute(query, {"event_id": request.drop_event_id}).mappings().first()
    if result is None:
        raise HTTPException(status_code=404, detail="Drop event not found")

    feature_dict = dict(result)
    ticker = feature_dict.pop("ticker")
    prediction = predict_recovery(feature_dict)
    if current_user is not None:
        new_prediction = Prediction(
            user_id=current_user.id,
            session_id=None,
            sector=feature_dict.get("sector"),
            drop_pct=feature_dict.get("drop_pct"),
            predicted_probability=prediction["probability"],
            model_version="v1",
        )
    else:
        new_prediction = Prediction(
            user_id=None,
            session_id=request.session_id,
            sector=feature_dict.get("sector"),
            drop_pct=feature_dict.get("drop_pct"),
            predicted_probability=prediction["probability"],
            model_version="v1",
        )

    db.add(new_prediction)
    db.commit()
    return {
        **prediction,
        "drop_event_id": request.drop_event_id,
        "ticker": ticker,
        "sector": feature_dict.get("sector"),
    }

@app.get("/api/predictions/me", response_model=list[PredictionHistoryItem])
def get_my_predictions(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    predictions = (
        db.query(Prediction)
        .filter(Prediction.user_id == current_user.id)
        .order_by(Prediction.created_at.desc())
        .all()
    )
    return predictions

@app.post("/api/predictions/claim")
def claim_predictions(session_id: str, db: Session = Depends(get_db),current_user: User = Depends(get_current_user)):
    result = db.query(Prediction).filter(Prediction.session_id == session_id,Prediction.user_id.is_(None)).update({"user_id": current_user.id, "session_id": None})
    db.commit()
    return {"claimed": result}



@app.get("/api/sectors")
def get_sectors(db: Session = Depends(get_db)):
    query = text("SELECT DISTINCT sector FROM symbols WHERE sector IS NOT NULL ORDER BY sector")
    result = db.execute(query).scalars().all()
    return result

@app.get("/api/drawdowns")
def get_drawdowns(ticker: str, db: Session = Depends(get_db)):
    query = text("""
        SELECT de.id, de.ticker, de.drop_quarter, de.drop_pct,
               de.max_drawdown_pct, de.days_to_recovery, de.recovered_within_1yr
        FROM drop_events de
        WHERE de.ticker = :ticker
        ORDER BY de.drop_quarter DESC
    """)
    result = db.execute(query, {"ticker": ticker}).mappings().all()
    return result
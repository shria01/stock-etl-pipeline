from datetime import timedelta

from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from api.database import get_db
from api.models import User, Prediction
from api.schemas import UserCreate, UserPublic, UserLogin, Token, PredictionRequest, PredictionResponse
from api.security import hash_password, verify_password, create_access_token, decode_access_token
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import text
from ml.predict_recovery import predict_recovery, get_model_data
from ml.survival_model import get_survival_model_data, predict_survival
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
        SELECT de.id, de.ticker, s.sector, de.drop_pct,
               de.event_max_drawdown_pct,
               de.drawdown_velocity_pct_per_day,
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
    # The survival model is a separate research artifact and is optional in
    # production. The active classifier must remain usable when it is absent.
    try:
        survival_curve = predict_survival(feature_dict)
        survival_model_version = get_survival_model_data().get("model_version", "unavailable")
    except (FileNotFoundError, OSError, KeyError, ValueError):
        survival_curve = []
        survival_model_version = "unavailable"
    if current_user is not None:
        new_prediction = Prediction(
            user_id=current_user.id,
            session_id=None,
            drop_event_id=feature_dict.get("id"),
            sector=feature_dict.get("sector"),
            drop_pct=feature_dict.get("drop_pct"),
            predicted_probability=prediction["probability"],
            model_version=prediction.get("model_version", "unknown"),
        )
    else:
        new_prediction = Prediction(
            user_id=None,
            session_id=request.session_id,
            drop_event_id=feature_dict.get("id"),
            sector=feature_dict.get("sector"),
            drop_pct=feature_dict.get("drop_pct"),
            predicted_probability=prediction["probability"],
            model_version=prediction.get("model_version", "unknown"),
        )

    db.add(new_prediction)
    db.commit()
    return {
        **prediction,
        "drop_event_id": request.drop_event_id,
        "ticker": ticker,
        "sector": feature_dict.get("sector"),
        "relative_drop_pct": feature_dict.get("relative_drop_pct"),
        "event_max_drawdown_pct": feature_dict.get("event_max_drawdown_pct"),
        "drawdown_velocity_pct_per_day": feature_dict.get("drawdown_velocity_pct_per_day"),
        "distance_from_52w_high": feature_dict.get("distance_from_52w_high"),
        "volatility_90d": feature_dict.get("volatility_90d"),
        "sector_relative_drop_pct": feature_dict.get("sector_relative_drop_pct"),
        "prior_90d_return": feature_dict.get("prior_90d_return"),
        "survival_model_version": survival_model_version,
        "survival_curve": survival_curve,
    }

@app.get("/api/predictions/me")
def get_my_predictions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = text("""
        SELECT
            p.id,
            p.user_id,
            p.session_id,
            p.drop_event_id,
            p.sector,
            p.drop_pct,
            p.predicted_probability,
            p.model_version,
            p.created_at,

            de.ticker,
            de.drop_quarter,
            de.days_to_recovery_after_prediction AS days_to_recovery,
            de.recovered_within_180d_after_prediction,
            de.event_max_drawdown_pct
        FROM predictions p
        LEFT JOIN drop_events de
            ON p.drop_event_id = de.id
        WHERE p.user_id = :user_id
        ORDER BY p.created_at DESC
    """)

    rows = db.execute(query, {"user_id": current_user.id}).mappings().all()
    return [dict(row) for row in rows]

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
        SELECT de.id, de.ticker, s.company, de.drop_quarter, de.drop_pct,
               de.days_to_recovery_after_prediction AS days_to_recovery,
               de.recovered_within_180d_after_prediction,
               de.event_max_drawdown_pct,
               de.drawdown_velocity_pct_per_day
        FROM drop_events de
        JOIN symbols s ON de.ticker = s.ticker
        WHERE de.ticker = :ticker
          AND de.model_exclusion_reason IS NULL
        ORDER BY de.drop_quarter DESC
    """)
    result = db.execute(query, {"ticker": ticker}).mappings().all()
    return result

@app.get("/api/drawdowns/recent")
def get_recent_drawdowns(limit: int = 12, db: Session = Depends(get_db)):
    query = text("""
        SELECT
            de.id,
            de.ticker,
            s.company,
            de.drop_quarter,
            de.drop_pct,
            de.event_max_drawdown_pct,
            de.drawdown_velocity_pct_per_day
        FROM drop_events de
        JOIN symbols s ON de.ticker = s.ticker
        WHERE de.model_exclusion_reason IS NULL
        ORDER BY de.drop_quarter DESC, de.id DESC
        LIMIT :limit
    """)
    result = db.execute(query, {"limit": min(max(limit, 1), 50)}).mappings().all()
    return result

@app.get("/api/drawdowns/{event_id}")
def get_drawdowns_by_id(event_id: int, db: Session = Depends(get_db)):
    query = text("""
        SELECT de.id, de.ticker, s.company, de.drop_quarter, de.drop_pct,
               de.days_to_recovery_after_prediction AS days_to_recovery,
               de.recovered_within_180d_after_prediction,
               de.event_max_drawdown_pct,
               de.drawdown_velocity_pct_per_day
        FROM drop_events de
        JOIN symbols s ON de.ticker = s.ticker
        WHERE de.id = :event_id
    """)
    result = db.execute(query, {"event_id": event_id}).mappings().first()
    if result is None:
        raise HTTPException(status_code=404, detail="Event not found")
    return result

@app.get("/api/tickers")
def get_tickers(db: Session = Depends(get_db)):
    query = text("SELECT ticker FROM symbols ORDER BY ticker")
    result = db.execute(query).scalars().all()
    return result

@app.get("/api/symbols")
def get_symbols(db: Session = Depends(get_db)):
    query = text("""
        SELECT ticker, company
        FROM symbols
        ORDER BY ticker
    """)
    result = db.execute(query).mappings().all()
    return result

@app.get("/api/sectors/{sector}/benchmark")
def get_sector_benchmark(sector: str, db: Session = Depends(get_db)):
    query = text("""
        SELECT
            s.sector,
            COUNT(*) AS total_events,
            AVG(de.recovered_within_180d_after_prediction::integer) AS sector_fast_recovery_rate,
            PERCENTILE_CONT(0.5) WITHIN GROUP (
                ORDER BY de.days_to_recovery_after_prediction
            ) FILTER (
                WHERE de.days_to_recovery_after_prediction IS NOT NULL
            ) AS median_days_to_recovery
        FROM drop_events de
        JOIN symbols s ON de.ticker = s.ticker
        WHERE s.sector = :sector
        GROUP BY s.sector
    """)
    result = db.execute(query, {"sector": sector}).mappings().first()  
    if result is None:
        raise HTTPException(status_code=404, detail="No data for this sector")

    return result

@app.get("/api/drawdowns/{event_id}/prices")
def get_drawdown_prices(event_id: int, db: Session = Depends(get_db)):
    event_query = text("""
        SELECT
            de.ticker,
            de.drop_quarter,
            de.trough_date,
            de.baseline_price,
            de.trough_price,
            de.prediction_date,
            de.recovered_date,
            de.days_to_recovery_after_prediction AS days_to_recovery,
            de.recovery_path_low_date,
            de.recovery_path_max_drawdown_pct,
            (
                SELECT MIN(sp.price_date)
                FROM stock_prices sp
                WHERE sp.ticker = de.ticker
                  AND sp.price_date >= de.drop_quarter
            ) AS baseline_date,
            (
                SELECT MAX(sp.price_date)
                FROM stock_prices sp
                WHERE sp.ticker = de.ticker
            ) AS latest_price_date
        FROM drop_events de
        WHERE de.id = :event_id
    """)
    event = db.execute(event_query, {"event_id": event_id}).first()
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")

    baseline_date = event.baseline_date or event.drop_quarter
    start_date = baseline_date - timedelta(days=30)
    end_date = event.latest_price_date

    if event.recovered_date is not None:
        end_date = min(
            event.recovered_date + timedelta(days=30),
            event.latest_price_date,
        )

    prices_query = text("""
        SELECT price_date, close
        FROM stock_prices
        WHERE ticker = :ticker
          AND price_date BETWEEN :start_date AND :end_date
        ORDER BY price_date
    """)
    prices = db.execute(prices_query, {"ticker": event.ticker, "start_date": start_date, "end_date": end_date}).mappings().all()

    return {
        "ticker": event.ticker,
        "baseline_date": baseline_date,
        "window_start_date": start_date,
        "window_end_date": end_date,
        "trough_date": event.trough_date,
        "baseline_price": event.baseline_price,
        "trough_price": event.trough_price,
        "prediction_date": event.prediction_date,
        "recovered_date": event.recovered_date,
        "days_to_recovery": event.days_to_recovery,
        "recovery_path_low_date": event.recovery_path_low_date,
        "recovery_path_max_drawdown_pct": event.recovery_path_max_drawdown_pct,
        "prices": prices,
    }

@app.get("/api/model-info")
def get_model_info():
    data = get_model_data()
    return {
        "model_name": data.get("model_name"),
        "model_version": data.get("model_version"),
        "threshold": data.get("threshold"),
        "metrics": data.get("metrics"),
    }

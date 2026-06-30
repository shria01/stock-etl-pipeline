import os
import logging
from datetime import datetime
from sqlalchemy import create_engine, text
from typing import Optional
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)
CONNECTION_STRING = os.environ.get("POSTGRES_CONN_STRING", "")
if not CONNECTION_STRING:
    raise EnvironmentError("POSTGRES_CONN_STRING error")


def get_engine():
    return create_engine(CONNECTION_STRING, pool_pre_ping=True)


def upsert_symbols(engine, df) -> int:
    if df.empty:
        return 0
    new_dict = df.to_dict("records")
    sql = text("""
        INSERT INTO symbols (ticker, company, sector)
        VALUES (:ticker, :company, :sector)
        ON CONFLICT (ticker) DO UPDATE SET 
            company=EXCLUDED.company, sector=EXCLUDED.sector, added_at=NOW()
    """)
    with engine.begin() as conn:
        conn.execute(sql, new_dict)
    logger.info(f"Upserted {len(new_dict)} rows in symbols")
    return len(new_dict)



def upsert_stock_prices(engine, df, ticker) -> int:
    if df.empty:
        return 0
    new_dict = df.to_dict("records")
    sql = text("""
        INSERT INTO stock_prices (ticker, price_date, open, high, low, close, volume)
        VALUES (:ticker, :price_date, :open, :high, :low, :close, :volume)
        ON CONFLICT (ticker, price_date) DO UPDATE SET 
            open=EXCLUDED.open, high=EXCLUDED.high, low=EXCLUDED.low,
            close=EXCLUDED.close, volume=EXCLUDED.volume, loaded_at=NOW()
    """)
    with engine.begin() as conn:
        conn.execute(sql, new_dict)
    logger.info(f"[{ticker}] Upserted {len(new_dict)} rows in stock_prices")
    return len(new_dict)


def upsert_moving_averages(engine, df, ticker) -> int:
    if df.empty:
        return 0
    new_dict = df.to_dict("records")
    sql = text("""
        INSERT INTO moving_averages (ticker, calc_date, ma_7, ma_30)
        VALUES (:ticker, :calc_date, :ma_7, :ma_30)
        ON CONFLICT (ticker, calc_date) DO UPDATE SET 
            ma_7=EXCLUDED.ma_7, ma_30=EXCLUDED.ma_30, updated_at=NOW()
    """)
    with engine.begin() as conn:
        conn.execute(sql, new_dict)
    logger.info(f"[{ticker}] Upserted {len(new_dict)} rows in moving_averages")
    return len(new_dict)


def log_etl_run(engine, ticker, status, rows_loaded, started_at, error_msg) :
    sql = text("""
        INSERT INTO etl_runs (ticker, status, rows_loaded, error_msg, started_at)
        VALUES (:ticker, :status, :rows_loaded, :error_msg, :started_at)
    """)
    with engine.begin() as conn:
        conn.execute(sql,{"ticker": ticker, "status": status, "rows_loaded": rows_loaded, "error_msg": error_msg, "started_at": started_at})


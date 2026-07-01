import pandas as pd
import logging
from typing import Optional

logger = logging.getLogger(__name__)
API_TO_DB_COLUMNS = {
    "1. open": "open",
    "2. high": "high",
    "3. low": "low",
    "4. close": "close",
    "5. volume": "volume"
}
YF_TO_DB_COLUMNS = {
    "Open": "open",
    "High": "high",
    "Low": "low",
    "Close": "close",
    "Volume": "volume"
}

def parse_raw_prices(ticker: str, raw_data: dict) -> Optional[pd.DataFrame]:
    try:
        data = raw_data.get("Time Series (Daily)", {})
        if not data:
            logger.error(f"[{ticker}] No time series data found")
            return None
        df = pd.DataFrame.from_dict(data, orient='index').reset_index(names='price_date')
        df = df.rename(columns=API_TO_DB_COLUMNS)
        for col in ["open", "high", "low", "close"]:
            df[col] = pd.to_numeric(df[col], errors="coerce")
        df["volume"] = pd.to_numeric(df["volume"], errors="coerce").astype("Int64")
        df["price_date"] = pd.to_datetime(df["price_date"]).dt.date
        df.insert(0, "ticker", ticker)
        df = df.dropna(subset=["open", "high", "low", "close"])
        df = df.sort_values(by=["price_date"], ascending = True).reset_index(drop=True)
        logger.info(f"[{ticker}] Parsed {len(df)} rows")
        return df
    except Exception as e:
        logger.exception(f"[{ticker}] Parse failed: {e}")
        return None

def parse_yfinance_prices(ticker: str, df: pd.DataFrame):
    try:
        df = df.reset_index(names='price_date')
        df = df.rename(columns=YF_TO_DB_COLUMNS)
        df = df[["price_date", "open", "high", "low", "close", "volume"]]
        df["price_date"] = pd.to_datetime(df["price_date"]).dt.date
        df.insert(0, "ticker", ticker)
        df = df.dropna(subset=["open", "high", "low", "close"])
        df = df.sort_values(by=["price_date"], ascending = True).reset_index(drop=True)
        logger.info(f"[{ticker}] Parsed {len(df)} rows from yfinance")
        return df
    except Exception as e:
        logger.exception(f"[{ticker}] yfinance parse failed: {e}")
        return None



def compute_moving_averages(df: pd.DataFrame, ticker: str) -> pd.DataFrame:
    ma_df = pd.DataFrame()
    ma_df['calc_date'] = df['price_date'].values
    ma_df['ticker'] = ticker
    ma_df['ma_7'] = df['close'].rolling(window=7, min_periods=1).mean().round(4)
    ma_df['ma_30'] = df['close'].rolling(window=30, min_periods=1).mean().round(4)
    return ma_df






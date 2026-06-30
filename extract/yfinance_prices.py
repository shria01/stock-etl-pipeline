import yfinance as yf
import logging
import pandas as pd
from typing import Optional

logger = logging.getLogger(__name__)

def get_historical_prices(ticker: str, period: str = "10y") -> Optional[pd.DataFrame]:
    try:
        stock = yf.Ticker(ticker)
        df = stock.history(period=period)
        if df.empty:
            logger.error(f"[{ticker}] No data returned")
            return None
        logger.info(f"[{ticker}] Retrieved {len(df)} days of history")
        return df
    
    except Exception as e:
        logger.error(f"[{ticker}] Failed: {e}")
        return None

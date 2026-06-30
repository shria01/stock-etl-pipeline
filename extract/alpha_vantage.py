import os
import requests
import logging
from typing import Optional
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)
BASE_URL = "https://www.alphavantage.co/query"
API_KEY = os.environ.get("ALPHA_VANTAGE_API_KEY", "")
if not API_KEY:
    raise EnvironmentError("ALPHA_VANTAGE_API_KEY is not set")

def get_daily_prices(ticker: str) -> Optional[dict]:
    
    params = {
        "function": "TIME_SERIES_DAILY",
        "symbol": ticker,
        "outputsize": "compact",
        "apikey": API_KEY,
    }
    try:
        logger.info(f"[{ticker}] Fetching prices...")
        response = requests.get(BASE_URL, params=params)
        response.raise_for_status()
        data = response.json()
        if "Error Message" in data:
            logger.error(f"[{ticker}] API error: {data['Error Message']}")
            return None
        if "Time Series (Daily)" not in data:
            logger.error(f"[{ticker}] Unexpected response: {list(data.keys())}")
            return None
        logger.info(f"[{ticker}] Got prices for {len(data['Time Series (Daily)'])} days")
        return data
    except Exception as e:
        logger.error(f"[{ticker}] Request failed: {e}")
        return None




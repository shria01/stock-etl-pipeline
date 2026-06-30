import logging
import pandas as pd
import requests
from io import StringIO

logger = logging.getLogger(__name__)

def get_sp500_symbols() -> pd.DataFrame:
    url = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
    headers = {"User-Agent": "Mozilla/5.0"}

    response = requests.get(url, headers=headers, timeout=20)
    response.raise_for_status()

    df = pd.read_html(StringIO(response.text))[0]

    df = df.rename(columns={
        "Symbol": "ticker",
        "Security": "company",
        "GICS Sector": "sector",
    })[["ticker", "company", "sector"]]

    logger.info(f"Fetched {len(df)} S&P500 companies")
    return df

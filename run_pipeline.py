import logging
import time
from datetime import datetime, timezone
from extract.alpha_vantage import get_daily_prices
from transform.clean import parse_raw_prices, compute_moving_averages
from load.postgres import get_engine, upsert_stock_prices, upsert_moving_averages, log_etl_run

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)
TICKERS = ["AAPL", "MSFT", "TSLA"]


def run(ticker):
    start_time = datetime.now(timezone.utc)
    db_engine = get_engine()
    try:
        raw_daily_prices = get_daily_prices(ticker)
        if raw_daily_prices is None:
            logger.error(f"[{ticker}] get_daily_prices failed")
            return
        df = parse_raw_prices(ticker, raw_daily_prices)
        if df is None:
            logger.error(f"[{ticker}] parse_raw_prices failed")
            return
        ma_df = compute_moving_averages(df, ticker)
        rows_loaded_sp = upsert_stock_prices(db_engine, df, ticker)
        rows_loaded_ma = upsert_moving_averages(db_engine, ma_df, ticker)
        log_etl_run(db_engine, ticker, "success", rows_loaded_sp, start_time)
    except Exception as e:
        log_etl_run(db_engine, ticker, "failed", 0, start_time, str(e))

if __name__ == "__main__":
    for ticker in TICKERS:
        run(ticker)
        time.sleep(15)

    


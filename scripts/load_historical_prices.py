import logging
import time
from datetime import datetime, timezone
from extract.yfinance_prices import get_historical_prices
from transform.clean import parse_yfinance_prices, compute_moving_averages
from load.postgres import get_engine, get_all_tickers, upsert_stock_prices, upsert_moving_averages, log_etl_run

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)
DELAY_SECONDS = 1


def run(ticker, engine):
    start_time = datetime.now(timezone.utc)
    try:
        df_yf_prices = get_historical_prices(ticker)
        if df_yf_prices is None:
            logger.error(f"[{ticker}] get_historical_prices failed")
            return
        df_cleaned = parse_yfinance_prices(ticker, df_yf_prices)
        if df_cleaned is None:
            logger.error(f"[{ticker}] parse_yfinance_prices failed")
            return
        ma_df = compute_moving_averages(df_cleaned, ticker)
        rows_loaded_sp = upsert_stock_prices(engine, df_cleaned, ticker)
        rows_loaded_ma = upsert_moving_averages(engine, ma_df, ticker)
        log_etl_run(engine, ticker, "success", rows_loaded_sp, start_time)
    except Exception as e:
        log_etl_run(engine, ticker, "failed", 0, start_time, str(e))


if __name__ == "__main__":
    engine = get_engine()
    tickers = get_all_tickers(engine)
    logger.info(f"Starting historical load for {len(tickers)} tickers")
    
    for i, ticker in enumerate(tickers, 1):
        logger.info(f"[{i}/{len(tickers)}] Processing {ticker}")
        run(ticker, engine)
        time.sleep(DELAY_SECONDS)

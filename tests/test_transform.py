import pandas as pd
from transform.clean import parse_raw_prices, parse_yfinance_prices,compute_moving_averages

ALPHA_VANTAGE_PAYLOAD = {
    "Meta Data": {"2. Symbol": "AAPL"},
    "Time Series (Daily)": {
        "2024-01-05": {"1. open": "185.00", "2. high": "187.00", "3. low": "184.00", "4. close": "186.00", "5. volume": "50000000"},
        "2024-01-04": {"1. open": "182.00", "2. high": "183.50", "3. low": "181.00", "4. close": "182.50", "5. volume": "45000000"},
    }
}


def make_yfinance_df():
    df = pd.DataFrame({
        "Open": [205.85, 208.08, 211.31],
        "High": [209.36, 212.50, 213.80],
        "Low": [205.33, 207.32, 210.97],
        "Close": [206.99, 211.60, 212.71],
        "Volume": [78788900, 67941800, 34955800],
        "Dividends": [0.0, 0.0, 0.0],
        "Stock Splits": [0.0, 0.0, 0.0],
    }, index=pd.to_datetime(["2025-07-01", "2025-07-02", "2025-07-03"], utc=True))
    df.index.name = "Date"
    return df



def test_parse_raw_prices_drops_null_price_rows():
    payload = {
        "Meta Data": {},
        "Time Series (Daily)": {
            "2024-01-05": {"1. open": "185.00", "2. high": "187.00", "3. low": "184.00", "4. close": None, "5. volume": "50000000"},
            "2024-01-04": {"1. open": "182.00", "2. high": "183.50", "3. low": "181.00", "4. close": "182.50", "5. volume": "45000000"},
        }
    }
    df = parse_raw_prices("AAPL", payload)
    assert len(df) == 1

def test_parse_raw_prices_empty_payload_returns_none():
    result = parse_raw_prices("AAPL", {"Meta Data": {}, "Time Series (Daily)": {}})
    assert result is None


def test_parse_raw_prices_numeric_types_converted():
    df = parse_raw_prices("AAPL", ALPHA_VANTAGE_PAYLOAD)
    for col in ["open", "high", "low", "close"]:
        assert pd.api.types.is_float_dtype(df[col])



def test_parse_yfinance_prices_drops_dividends_and_splits():
    df = parse_yfinance_prices("AAPL", make_yfinance_df())
    assert "Dividends" not in df.columns
    assert "Stock Splits" not in df.columns


def test_compute_moving_averages_ticker_never_null():
    df = parse_yfinance_prices("AAPL", make_yfinance_df())
    ma = compute_moving_averages(df, "AAPL")
    assert ma["ticker"].notna().all()
    assert (ma["ticker"] == "AAPL").all()


def test_compute_moving_averages_row_count_matches_input():
    df = parse_yfinance_prices("AAPL", make_yfinance_df())
    ma = compute_moving_averages(df, "AAPL")
    assert len(ma) == len(df)

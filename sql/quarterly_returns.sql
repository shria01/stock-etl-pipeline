
INSERT INTO quarterly_returns (ticker, quarter, start_price, end_price, quarterly_return)
WITH quarterly_prices AS (
    SELECT DISTINCT
        ticker,
        DATE_TRUNC('quarter', price_date)::date AS quarter,
        FIRST_VALUE(close) OVER(
            PARTITION BY ticker, DATE_TRUNC('quarter', price_date)
            ORDER BY price_date ASC
        ) AS start_price,
        FIRST_VALUE(close) OVER(
            PARTITION BY ticker, DATE_TRUNC('quarter', price_date)
            ORDER BY price_date DESC
        ) AS end_price
    FROM stock_prices
)
SELECT
    ticker,
    quarter,
    start_price,
    end_price,
    ROUND((end_price - start_price) / start_price, 4) AS quarterly_return
FROM quarterly_prices
ON CONFLICT (ticker, quarter) DO UPDATE SET
    start_price = EXCLUDED.start_price,
    end_price = EXCLUDED.end_price,
    quarterly_return = EXCLUDED.quarterly_return;

    
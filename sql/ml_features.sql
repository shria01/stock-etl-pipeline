
-- Feature: volatility_90d

WITH daily_returns AS (
    SELECT ticker, price_date,
        (close / LAG(close) OVER (PARTITION BY ticker ORDER BY price_date) - 1) AS daily_return
    FROM stock_prices
),
labeled AS (
    SELECT dr.ticker, dr.price_date,
        STDDEV(dr.daily_return) OVER (
            PARTITION BY dr.ticker
            ORDER BY dr.price_date
            ROWS BETWEEN 90 PRECEDING AND 1 PRECEDING
        ) AS rolling_90day_stddev
    FROM daily_returns dr
)
UPDATE drop_events de
SET volatility_90d = ROUND(labeled.rolling_90day_stddev, 4)
FROM labeled
WHERE de.ticker = labeled.ticker AND de.trough_date = labeled.price_date;
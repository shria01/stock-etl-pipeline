
TRUNCATE drop_events;

INSERT INTO drop_events (ticker, drop_quarter, baseline_price, trough_price, drop_pct, max_drawdown_pct)
WITH quarterly_analysis AS (
    SELECT DISTINCT
        ticker,
        DATE_TRUNC('quarter', price_date)::date AS quarter,
        FIRST_VALUE(close) OVER (
            PARTITION BY ticker, DATE_TRUNC('quarter', price_date)
            ORDER BY price_date ASC
        ) AS baseline_price,
        MIN(close) OVER (
            PARTITION BY ticker, DATE_TRUNC('quarter', price_date)
        ) AS trough_price
    FROM stock_prices
)
SELECT
    qa.ticker,
    qa.quarter AS drop_quarter,
    qa.baseline_price,
    qa.trough_price,
    qr.quarterly_return AS drop_pct,
    ROUND((qa.trough_price - qa.baseline_price) / qa.baseline_price, 4) AS max_drawdown_pct
FROM quarterly_analysis qa
JOIN quarterly_returns qr
    ON qa.ticker = qr.ticker AND qa.quarter = qr.quarter
WHERE qr.quarterly_return <= -0.15;


ALTER TABLE drop_events ADD COLUMN IF NOT EXISTS trough_date DATE;


UPDATE drop_events de
SET trough_date = trough.price_date
FROM (
    SELECT DISTINCT ON (ticker, DATE_TRUNC('quarter', price_date))
        ticker,
        DATE_TRUNC('quarter', price_date)::date AS quarter,
        price_date,
        close
    FROM stock_prices
    ORDER BY ticker, DATE_TRUNC('quarter', price_date), close ASC, price_date ASC
) AS trough
WHERE de.ticker = trough.ticker AND de.drop_quarter = trough.quarter;


UPDATE drop_events de
SET
    recovered_date = recovery.recovered_date,
    days_to_recovery = recovery.recovered_date - de.trough_date,
    recovered_within_1yr = (recovery.recovered_date - de.trough_date) <= 365
FROM (
    SELECT
        de.id,
        MIN(sp.price_date) AS recovered_date
    FROM drop_events de
    JOIN stock_prices sp
        ON sp.ticker = de.ticker
        AND sp.price_date > de.trough_date
        AND sp.close >= de.baseline_price
    GROUP BY de.id
) AS recovery
WHERE de.id = recovery.id;


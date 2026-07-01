
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



-- Feature: volume_change_pct
WITH volume_history AS (
    SELECT
        ticker,
        price_date,
        AVG(volume) OVER (
            PARTITION BY ticker
            ORDER BY price_date
            ROWS BETWEEN 90 PRECEDING AND 1 PRECEDING
        ) AS avg_volume_before,
        ROW_NUMBER() OVER (
            PARTITION BY ticker, DATE_TRUNC('quarter', price_date)
            ORDER BY price_date ASC
        ) AS day_rank
    FROM stock_prices
),
drop_period_volume AS (
    SELECT
        de.id,
        de.ticker,
        de.drop_quarter,
        AVG(sp.volume) AS avg_volume_during
    FROM drop_events de
    JOIN stock_prices sp
        ON sp.ticker = de.ticker
       AND sp.price_date BETWEEN de.drop_quarter AND de.trough_date
    GROUP BY
        de.id,
        de.ticker,
        de.drop_quarter
)
UPDATE drop_events de
SET volume_change_pct = ROUND(
    (dpv.avg_volume_during - vh.avg_volume_before)
    / NULLIF(vh.avg_volume_before, 0),
    4
)
FROM drop_period_volume dpv
JOIN volume_history vh
    ON vh.ticker = dpv.ticker
   AND DATE_TRUNC('quarter', vh.price_date)::date = dpv.drop_quarter
   AND vh.day_rank = 1
WHERE de.id = dpv.id;



-- Feature: prior_90d_return
WITH prices_with_prior AS (
    SELECT
        ticker,
        price_date,
        close,
        LAG(close, 90) OVER (
            PARTITION BY ticker
            ORDER BY price_date
        ) AS price_90d_ago,
        ROW_NUMBER() OVER (
            PARTITION BY ticker, DATE_TRUNC('quarter', price_date)
            ORDER BY price_date ASC
        ) AS day_rank
    FROM stock_prices
),
prior_returns AS (
    SELECT
        ticker,
        price_date,
        close / NULLIF(price_90d_ago, 0) - 1 AS prior_90d_return,
        day_rank
    FROM prices_with_prior
)
UPDATE drop_events de
SET prior_90d_return = ROUND(pr.prior_90d_return, 4)
FROM prior_returns pr
WHERE de.ticker = pr.ticker
  AND DATE_TRUNC('quarter', pr.price_date)::date = de.drop_quarter
  AND pr.day_rank = 1;



-- Feature: distance_from_52w_high
WITH rolling_high AS (
    SELECT
        ticker,
        price_date,
        MAX(close) OVER (
            PARTITION BY ticker
            ORDER BY price_date
            ROWS BETWEEN 252 PRECEDING AND 1 PRECEDING
        ) AS high_252d
    FROM stock_prices
)
UPDATE drop_events de
SET distance_from_52w_high = ROUND(
    (de.trough_price - rh.high_252d) / NULLIF(rh.high_252d, 0), 4
)
FROM rolling_high rh
WHERE de.ticker = rh.ticker AND de.trough_date = rh.price_date;
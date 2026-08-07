
ALTER TABLE drop_events
ADD COLUMN IF NOT EXISTS event_max_drawdown_pct numeric(12,4),
ADD COLUMN IF NOT EXISTS recovery_path_low_date date,
ADD COLUMN IF NOT EXISTS recovery_path_low_price numeric(12,4),
ADD COLUMN IF NOT EXISTS recovery_path_max_drawdown_pct numeric(12,4),
ADD COLUMN IF NOT EXISTS prediction_date date,
ADD COLUMN IF NOT EXISTS label_end_date date,
ADD COLUMN IF NOT EXISTS days_to_recovery_after_prediction integer,
ADD COLUMN IF NOT EXISTS recovered_within_180d_after_prediction boolean,
ADD COLUMN IF NOT EXISTS model_exclusion_reason varchar(40);

INSERT INTO drop_events (ticker, drop_quarter, baseline_price, trough_price, drop_pct, event_max_drawdown_pct)
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
    ROUND((qa.trough_price - qa.baseline_price) / qa.baseline_price, 4) AS event_max_drawdown_pct
FROM quarterly_analysis qa
JOIN quarterly_returns qr
    ON qa.ticker = qr.ticker AND qa.quarter = qr.quarter
WHERE qr.quarterly_return <= -0.15
ON CONFLICT (ticker, drop_quarter) DO UPDATE
SET
    baseline_price = EXCLUDED.baseline_price,
    trough_price = EXCLUDED.trough_price,
    drop_pct = EXCLUDED.drop_pct,
    event_max_drawdown_pct = EXCLUDED.event_max_drawdown_pct;


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


-- Option A model cutoff and target. The prediction is made after the final
-- trading day of the completed drop quarter. Outcomes already known at that
-- point and unresolved events without 180 days of follow-up are excluded.
WITH event_cutoffs AS (
    SELECT
        de.id,
        MAX(sp.price_date) AS prediction_date
    FROM drop_events de
    JOIN stock_prices sp
      ON sp.ticker = de.ticker
     AND DATE_TRUNC('quarter', sp.price_date)::date = de.drop_quarter
    GROUP BY de.id
),
latest_prices AS (
    SELECT ticker, MAX(price_date) AS latest_price_date
    FROM stock_prices
    GROUP BY ticker
)
UPDATE drop_events de
SET
    prediction_date = ec.prediction_date,
    label_end_date = ec.prediction_date + 180,
    days_to_recovery_after_prediction = CASE
        WHEN de.recovered_date > ec.prediction_date
        THEN de.recovered_date - ec.prediction_date
        ELSE NULL
    END,
    recovered_within_180d_after_prediction = CASE
        WHEN de.recovered_date <= ec.prediction_date THEN NULL
        WHEN lp.latest_price_date < ec.prediction_date + 180 THEN NULL
        WHEN de.recovered_date > ec.prediction_date
         AND de.recovered_date <= ec.prediction_date + 180 THEN TRUE
        ELSE FALSE
    END,
    model_exclusion_reason = CASE
        WHEN de.recovered_date <= ec.prediction_date THEN 'resolved_before_prediction'
        WHEN lp.latest_price_date < ec.prediction_date + 180 THEN 'insufficient_followup'
        ELSE NULL
    END
FROM event_cutoffs ec, latest_prices lp
WHERE de.id = ec.id
  AND lp.ticker = de.ticker;


-- Outcome diagnostic only: this window includes post-prediction prices and
-- must never be added to the model feature set.
WITH latest_prices AS (
    SELECT ticker, MAX(price_date) AS latest_price_date
    FROM stock_prices
    GROUP BY ticker
),
event_bounds AS (
    SELECT
        de.id,
        de.ticker,
        de.baseline_price,
        de.drop_quarter,
        COALESCE(de.recovered_date, lp.latest_price_date) AS path_end_date
    FROM drop_events de
    JOIN latest_prices lp ON lp.ticker = de.ticker
),
path_lows AS (
    SELECT DISTINCT ON (eb.id)
        eb.id,
        sp.price_date AS recovery_path_low_date,
        sp.close AS recovery_path_low_price,
        (sp.close - eb.baseline_price) / NULLIF(eb.baseline_price, 0)
            AS recovery_path_max_drawdown_pct
    FROM event_bounds eb
    JOIN stock_prices sp
      ON sp.ticker = eb.ticker
     AND sp.price_date BETWEEN eb.drop_quarter AND eb.path_end_date
    ORDER BY eb.id, sp.close ASC, sp.price_date ASC
)
UPDATE drop_events de
SET
    recovery_path_low_date = pl.recovery_path_low_date,
    recovery_path_low_price = pl.recovery_path_low_price,
    recovery_path_max_drawdown_pct = ROUND(pl.recovery_path_max_drawdown_pct, 4)
FROM path_lows pl
WHERE de.id = pl.id;

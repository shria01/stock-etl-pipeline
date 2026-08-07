
-- Feature: signed event drawdown per calendar day. The prediction cutoff is
-- the final available trading date in the completed drop quarter, so this
-- never reads from the subsequent recovery path.
ALTER TABLE drop_events
ADD COLUMN IF NOT EXISTS drawdown_velocity_pct_per_day numeric(12,8);

WITH event_windows AS (
    SELECT
        de.id,
        MIN(sp.price_date) AS baseline_date,
        MAX(sp.price_date) AS prediction_date
    FROM drop_events de
    JOIN stock_prices sp
      ON sp.ticker = de.ticker
     AND DATE_TRUNC('quarter', sp.price_date)::date = de.drop_quarter
    GROUP BY de.id
)
UPDATE drop_events de
SET drawdown_velocity_pct_per_day = ROUND(
    de.event_max_drawdown_pct / NULLIF(
        GREATEST(ew.prediction_date - ew.baseline_date, 1),
        0
    ),
    8
)
FROM event_windows ew
WHERE de.id = ew.id;


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

-- Feature: relative_drop_pct
WITH sp500_quarterly AS(
    SELECT DISTINCT 
        DATE_TRUNC('quarter', price_date)::date AS quarter,
        FIRST_VALUE(close) OVER (
            PARTITION BY ticker, DATE_TRUNC('quarter', price_date)
            ORDER BY price_date ASC
        ) AS sp500_start,
        FIRST_VALUE(close) OVER (
            PARTITION BY ticker, DATE_TRUNC('quarter', price_date)
            ORDER BY price_date DESC
        ) AS sp500_end
    FROM stock_prices
    WHERE ticker = '^GSPC'
)
UPDATE drop_events de
SET relative_drop_pct = ROUND(
    de.drop_pct - ((sp.sp500_end - sp.sp500_start) / sp.sp500_start), 4
)
FROM sp500_quarterly sp
WHERE de.drop_quarter = sp.quarter;

--Feature:prior_90_day_return
WITH sp500_prior_returns AS (
    SELECT
        price_date,
        (close / NULLIF(LAG(close, 90) OVER (ORDER BY price_date), 0) - 1) AS sp500_90d_return,
        ROW_NUMBER() OVER (
            PARTITION BY DATE_TRUNC('quarter', price_date)
            ORDER BY price_date ASC
        ) AS day_rank
    FROM stock_prices
    WHERE ticker = '^GSPC'
)
UPDATE drop_events de
SET relative_prior_90d_return = ROUND(de.prior_90d_return - spr.sp500_90d_return, 4)
FROM sp500_prior_returns spr
WHERE DATE_TRUNC('quarter', spr.price_date)::date = de.drop_quarter
  AND spr.day_rank = 1
  AND de.prior_90d_return is NOT NULL;


-- Feature: sector_relative_drop_pct
WITH sector_returns_ex_stock AS (
    SELECT
        de.id,
        AVG(qr.quarterly_return) AS sector_avg_return_ex_stock
    FROM drop_events de
    JOIN symbols target_symbol ON de.ticker = target_symbol.ticker
    JOIN symbols peer_symbol
        ON target_symbol.sector = peer_symbol.sector
       AND target_symbol.ticker <> peer_symbol.ticker
    JOIN quarterly_returns qr
        ON qr.ticker = peer_symbol.ticker
       AND qr.quarter = de.drop_quarter
    GROUP BY de.id
)
UPDATE drop_events de
SET sector_relative_drop_pct = ROUND(de.drop_pct - sr.sector_avg_return_ex_stock, 4)
FROM sector_returns_ex_stock sr
WHERE de.id = sr.id;


-- Leakage-safe interactions. Every component is available by the completed
-- quarter prediction cutoff.
ALTER TABLE drop_events
ADD COLUMN IF NOT EXISTS severity_x_volatility numeric(12,8),
ADD COLUMN IF NOT EXISTS relative_drop_x_velocity numeric(12,8),
ADD COLUMN IF NOT EXISTS prior_return_x_relative_drop numeric(12,8);

UPDATE drop_events
SET
    severity_x_volatility = ROUND(event_max_drawdown_pct * volatility_90d, 8),
    relative_drop_x_velocity = ROUND(relative_drop_pct * drawdown_velocity_pct_per_day, 8),
    prior_return_x_relative_drop = ROUND(prior_90d_return * relative_drop_pct, 8);


-- Point-in-time market regime at the completed-quarter prediction cutoff.
ALTER TABLE drop_events
ADD COLUMN IF NOT EXISTS sp500_volatility_90d numeric(12,8),
ADD COLUMN IF NOT EXISTS sp500_return_20d numeric(12,8),
ADD COLUMN IF NOT EXISTS sp500_return_90d numeric(12,8),
ADD COLUMN IF NOT EXISTS sp500_distance_from_52w_high numeric(12,8),
ADD COLUMN IF NOT EXISTS market_breadth_below_200d numeric(12,8);

WITH sp500_daily AS (
    SELECT
        price_date,
        close,
        close / NULLIF(LAG(close) OVER (ORDER BY price_date), 0) - 1 AS daily_return,
        LAG(close, 20) OVER (ORDER BY price_date) AS close_20d_ago,
        LAG(close, 90) OVER (ORDER BY price_date) AS close_90d_ago,
        MAX(close) OVER (
            ORDER BY price_date ROWS BETWEEN 251 PRECEDING AND CURRENT ROW
        ) AS high_252d
    FROM stock_prices
    WHERE ticker = '^GSPC'
),
sp500_regime AS (
    SELECT
        price_date,
        close / NULLIF(close_20d_ago, 0) - 1 AS return_20d,
        close / NULLIF(close_90d_ago, 0) - 1 AS return_90d,
        close / NULLIF(high_252d, 0) - 1 AS distance_from_52w_high,
        STDDEV(daily_return) OVER (
            ORDER BY price_date ROWS BETWEEN 89 PRECEDING AND CURRENT ROW
        ) AS volatility_90d
    FROM sp500_daily
)
UPDATE drop_events de
SET
    sp500_volatility_90d = ROUND(sr.volatility_90d, 8),
    sp500_return_20d = ROUND(sr.return_20d, 8),
    sp500_return_90d = ROUND(sr.return_90d, 8),
    sp500_distance_from_52w_high = ROUND(sr.distance_from_52w_high, 8)
FROM sp500_regime sr
WHERE sr.price_date = de.prediction_date;

WITH moving_averages AS (
    SELECT
        ticker,
        price_date,
        close,
        AVG(close) OVER (
            PARTITION BY ticker
            ORDER BY price_date
            ROWS BETWEEN 199 PRECEDING AND CURRENT ROW
        ) AS moving_average_200d,
        COUNT(*) OVER (
            PARTITION BY ticker
            ORDER BY price_date
            ROWS BETWEEN 199 PRECEDING AND CURRENT ROW
        ) AS observations
    FROM stock_prices
    WHERE ticker <> '^GSPC'
),
daily_breadth AS (
    SELECT
        price_date,
        AVG((close < moving_average_200d)::int::numeric) AS breadth_below_200d
    FROM moving_averages
    WHERE observations = 200
    GROUP BY price_date
)
UPDATE drop_events de
SET market_breadth_below_200d = ROUND(db.breadth_below_200d, 8)
FROM daily_breadth db
WHERE db.price_date = de.prediction_date;


-- Drawdown shape observed only between the event baseline and prediction date.
ALTER TABLE drop_events
ADD COLUMN IF NOT EXISTS days_underwater_as_of_prediction integer,
ADD COLUMN IF NOT EXISTS pct_days_underwater_in_event_window numeric(12,8),
ADD COLUMN IF NOT EXISTS number_of_new_lows_in_event_window integer,
ADD COLUMN IF NOT EXISTS bounce_from_event_low_pct numeric(12,8),
ADD COLUMN IF NOT EXISTS last_20d_return_before_prediction numeric(12,8),
ADD COLUMN IF NOT EXISTS last_10d_return_before_prediction numeric(12,8),
ADD COLUMN IF NOT EXISTS slope_20d_before_prediction numeric(12,8);

WITH event_prices AS (
    SELECT
        de.id,
        de.baseline_price,
        de.prediction_date,
        sp.price_date,
        sp.close,
        ROW_NUMBER() OVER (PARTITION BY de.id ORDER BY sp.price_date) AS day_number,
        ROW_NUMBER() OVER (PARTITION BY de.id ORDER BY sp.price_date DESC) AS reverse_day_number,
        MIN(sp.close) OVER (
            PARTITION BY de.id
            ORDER BY sp.price_date
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ) AS prior_low
    FROM drop_events de
    JOIN stock_prices sp
      ON sp.ticker = de.ticker
     AND sp.price_date BETWEEN de.drop_quarter AND de.prediction_date
),
event_shape AS (
    SELECT
        id,
        prediction_date - MIN(price_date) FILTER (WHERE close < baseline_price)
            AS days_underwater,
        AVG((close < baseline_price)::int::numeric) AS pct_days_underwater,
        COUNT(*) FILTER (WHERE prior_low IS NOT NULL AND close < prior_low) AS new_lows,
        MAX(close) FILTER (WHERE reverse_day_number = 1) AS prediction_close,
        MAX(close) FILTER (WHERE reverse_day_number = 11) AS close_10d_ago,
        MAX(close) FILTER (WHERE reverse_day_number = 21) AS close_20d_ago,
        MIN(close) AS event_low,
        REGR_SLOPE(close, day_number) FILTER (WHERE reverse_day_number <= 20)
            AS slope_20d
    FROM event_prices
    GROUP BY id, prediction_date
)
UPDATE drop_events de
SET
    days_underwater_as_of_prediction = es.days_underwater,
    pct_days_underwater_in_event_window = ROUND(es.pct_days_underwater, 8),
    number_of_new_lows_in_event_window = es.new_lows,
    bounce_from_event_low_pct = ROUND(
        es.prediction_close / NULLIF(es.event_low, 0) - 1, 8
    ),
    last_20d_return_before_prediction = ROUND(
        es.prediction_close / NULLIF(es.close_20d_ago, 0) - 1, 8
    ),
    last_10d_return_before_prediction = ROUND(
        es.prediction_close / NULLIF(es.close_10d_ago, 0) - 1, 8
    ),
    slope_20d_before_prediction = ROUND(
        (es.slope_20d / NULLIF(es.prediction_close, 0))::numeric, 8
    )
FROM event_shape es
WHERE de.id = es.id;


-- Same-ticker history is restricted to outcomes whose full label horizon was
-- already observable at the current event's prediction date.
ALTER TABLE drop_events
ADD COLUMN IF NOT EXISTS ticker_prior_fast_recovery_rate numeric(12,8),
ADD COLUMN IF NOT EXISTS ticker_prior_median_days_to_recovery numeric(12,4),
ADD COLUMN IF NOT EXISTS ticker_prior_event_count integer,
ADD COLUMN IF NOT EXISTS ticker_prior_avg_drawdown numeric(12,8);

WITH ticker_history AS (
    SELECT
        current_event.id,
        COUNT(prior_event.id) AS prior_event_count,
        AVG(prior_event.recovered_within_180d_after_prediction::int::numeric)
            AS prior_fast_recovery_rate,
        PERCENTILE_CONT(0.5) WITHIN GROUP (
            ORDER BY prior_event.days_to_recovery_after_prediction
        ) FILTER (
            WHERE prior_event.days_to_recovery_after_prediction IS NOT NULL
        ) AS prior_median_days_to_recovery,
        AVG(prior_event.event_max_drawdown_pct) AS prior_avg_drawdown
    FROM drop_events current_event
    LEFT JOIN drop_events prior_event
      ON prior_event.ticker = current_event.ticker
     AND prior_event.label_end_date < current_event.prediction_date
     AND prior_event.recovered_within_180d_after_prediction IS NOT NULL
    GROUP BY current_event.id
)
UPDATE drop_events de
SET
    ticker_prior_fast_recovery_rate = ROUND(th.prior_fast_recovery_rate, 8),
    ticker_prior_median_days_to_recovery = ROUND(th.prior_median_days_to_recovery::numeric, 4),
    ticker_prior_event_count = th.prior_event_count,
    ticker_prior_avg_drawdown = ROUND(th.prior_avg_drawdown, 8)
FROM ticker_history th
WHERE de.id = th.id;

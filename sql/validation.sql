-- A nonzero count means a trough-dependent model feature may use information
-- beyond its completed drop-quarter prediction cutoff.
SELECT
    COUNT(*) AS leaking_trough_rows
FROM drop_events
WHERE trough_date > (
    DATE_TRUNC('quarter', drop_quarter)::date
    + INTERVAL '3 months'
    - INTERVAL '1 day'
);

-- Outcome-only columns must remain absent from ml/predict_recovery.py's
-- NUMERIC_COLS. This summary is useful for checking the stored chart values.
SELECT
    COUNT(*) AS events,
    COUNT(recovery_path_max_drawdown_pct) AS events_with_path_diagnostic,
    MIN(recovery_path_max_drawdown_pct) AS deepest_recovery_path_drawdown,
    MAX(recovery_path_max_drawdown_pct) AS shallowest_recovery_path_drawdown
FROM drop_events;

-- Option A eligibility audit: quarter-end prediction with a subsequent
-- 180-calendar-day recovery horizon.
SELECT
    COUNT(*) FILTER (
        WHERE model_exclusion_reason = 'resolved_before_prediction'
    ) AS resolved_before_prediction,
    COUNT(*) FILTER (
        WHERE model_exclusion_reason = 'insufficient_followup'
    ) AS insufficient_followup,
    COUNT(*) FILTER (
        WHERE recovered_within_180d_after_prediction IS NOT NULL
    ) AS model_eligible_events
FROM drop_events;

SELECT COUNT(*) AS immature_rows_in_model
FROM drop_events de
WHERE de.recovered_within_180d_after_prediction IS NOT NULL
  AND EXISTS (
      SELECT 1
      FROM (
          SELECT ticker, MAX(price_date) AS latest_price_date
          FROM stock_prices
          GROUP BY ticker
      ) latest
      WHERE latest.ticker = de.ticker
        AND latest.latest_price_date < de.label_end_date
  );

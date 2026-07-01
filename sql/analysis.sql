
-- Query 1: Average recovery time by sector
SELECT
    s.sector,
    ROUND(AVG(de.days_to_recovery), 1) AS avg_days_to_recovery,
    COUNT(*) AS total_drops
FROM drop_events de
JOIN symbols s ON de.ticker = s.ticker
WHERE de.days_to_recovery IS NOT NULL
GROUP BY s.sector
ORDER BY avg_days_to_recovery ASC;


-- Query 2: Recovery rate (including stocks that never recovered) by sector
SELECT
    s.sector,
    COUNT(*) AS total_drops,
    COUNT(de.recovered_date) AS recovered_count,
    ROUND(100.0 * COUNT(de.recovered_date) / COUNT(*), 1) AS pct_recovered_at_all
FROM drop_events de
JOIN symbols s ON de.ticker = s.ticker
GROUP BY s.sector
ORDER BY pct_recovered_at_all DESC;


-- Query 3: Sector x severity matrix
WITH sector_severity AS (
    SELECT
        s.sector,
        CASE
            WHEN de.drop_pct <= -0.40 THEN 'Severe (40%+)'
            WHEN de.drop_pct <= -0.25 THEN 'Major (25-40%)'
            ELSE 'Moderate (15-25%)'
        END AS severity_bucket,
        de.days_to_recovery
    FROM drop_events de
    JOIN symbols s ON de.ticker = s.ticker
    WHERE de.days_to_recovery IS NOT NULL
)
SELECT
    sector,
    severity_bucket,
    ROUND(AVG(days_to_recovery), 1) AS avg_days_to_recovery,
    COUNT(*) AS total_drops
FROM sector_severity
GROUP BY sector, severity_bucket
ORDER BY sector,
    CASE severity_bucket
        WHEN 'Moderate (15-25%)' THEN 1
        WHEN 'Major (25-40%)' THEN 2
        WHEN 'Severe (40%+)' THEN 3
    END;


-- Query 4: Fast vs slow recovery - feature comparison
WITH labeled AS (
    SELECT
        de.*,
        s.sector,
        CASE WHEN de.days_to_recovery <= 90 THEN 'Fast (<=90 days)'
             ELSE 'Slow (>90 days)'
        END AS recovery_speed
    FROM drop_events de
    JOIN symbols s ON de.ticker = s.ticker
    WHERE de.days_to_recovery IS NOT NULL
)
SELECT
    recovery_speed,
    COUNT(*) AS total_drops,
    ROUND(AVG(drop_pct) * 100, 1) AS avg_drop_pct,
    ROUND(AVG(max_drawdown_pct) * 100, 1) AS avg_max_drawdown_pct,
    MODE() WITHIN GROUP (ORDER BY sector) AS most_common_sector
FROM labeled
GROUP BY recovery_speed;
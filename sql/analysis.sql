
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


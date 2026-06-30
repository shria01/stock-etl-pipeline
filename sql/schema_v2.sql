-- New tables for S&P 500 recovery cohort analysis

CREATE TABLE IF NOT EXISTS quarterly_returns (
    id                SERIAL PRIMARY KEY,
    ticker            VARCHAR(10)  NOT NULL REFERENCES symbols(ticker),
    quarter           DATE         NOT NULL,
    start_price       NUMERIC(12,4),
    end_price         NUMERIC(12,4),
    quarterly_return  NUMERIC(8,4),
    UNIQUE (ticker, quarter)
);

CREATE TABLE IF NOT EXISTS drop_events (
    id                     SERIAL PRIMARY KEY,
    ticker                 VARCHAR(10)  NOT NULL REFERENCES symbols(ticker),
    drop_quarter           DATE         NOT NULL,
    baseline_price         NUMERIC(12,4),
    trough_price           NUMERIC(12,4),
    drop_pct               NUMERIC(12,4),
    volatility_90d         NUMERIC(12,4),
    market_cap             BIGINT,
    recovered_date         DATE,
    days_to_recovery       INT,
    recovered_within_1yr   BOOL,
    UNIQUE (ticker, drop_quarter)
);

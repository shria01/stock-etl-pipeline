# S&P 500 Recovery Cohort Analysis
 
I built this to answer a question: when an S&P 500 stock drops more than 15% in a quarter, how long does it actually take to recover, and does that depend on the sector, the size of the drop, or anything else you could predict ahead of time?
 
It's a full pipeline with real stock data pulled from APIs, loaded into Postgres, analyzed with SQL, and fed into a model that predicts whether a stock will bounce back fast or not.
 
**→ [Full analysis and findings: `Recovery Analysis SQL Project.ipynb`](Recovery%20Analysis%20SQL%20Project.ipynb)**
 
## What's in here
 
`extract/` pulls daily prices from Alpha Vantage and Yahoo Finance. `transform/` cleans that up into a consistent format. `load/` writes it into Postgres, using upserts so it's safe to re-run without creating duplicates. `sql/` has all the analysis quarterly returns, drop detection, recovery time, and the cohort queries. `ml/` has the model that predicts fast vs. slow recovery, and `tests/` covers the parts of the pipeline where a silent bug would actually matter.
 
## Scale
 
- 503 S&P 500 tickers, 10 years of daily prices (~1.2M rows)
- 1,765 drop events (15%+ quarterly declines)
- 6 engineered features per event, all point-in-time so there's no look-ahead bias
  
## What I found
 
Healthcare and Industrials recovered the fastest (around 266–280 days on average). Energy took almost twice as long, around 457 days — even though Energy stocks eventually recovered *more often* than most other sectors. So speed and likelihood of recovery turned out to be two different things.
 
I trained a Logistic Regression model to predict whether a stock recovers within 180 days, using drop severity, volatility, momentum, volume, and sector as features. Evaluated with a time-based train/test split (training on earlier events, testing on later ones) it reached about 67% accuracy and 0.68 ROC AUC, outperforming a regularized Random Forest on every metric.
 
The first version of the model used a random train/test split and showed higher accuracy (~69%) but that number was inflated because random splitting let the model train on some future events and test on some past ones making it leak information it wouldn't have access to in real prediction. Switching to a time-based split gave an honest, lower number, and also surfaced that the simpler linear model generalized better across different market regimes than the more flexible Random Forest.
 
All the details and charts are in the notebook.
 
## Setup
 
**1. Start PostgreSQL:**
```bash
docker run -d --name stock_etl_db \
  -e POSTGRES_USER=etl_user \
  -e POSTGRES_PASSWORD=<your_password> \
  -e POSTGRES_DB=stock_db \
  -p 5432:5432 \
  postgres:15
```
 
**2. Set up environment:**
```bash
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # add your DB password and Alpha Vantage API key
```
(You only need an Alpha Vantage API key if you want to run `run_pipeline.py`. The main data load uses yfinance, no key required.)
 
**3. Build the schema:**
```bash
docker exec -i stock_etl_db psql -U etl_user -d stock_db < sql/schema.sql
```
 
**4. Load the data:**
```bash
python3 -m scripts.load_symbols              # all 503 S&P 500 tickers
python3 -m scripts.load_historical_prices    # 10 years of history, takes ~30-45 min
```
 
**5. Run the SQL analysis, in order:**
```bash
docker exec -i stock_etl_db psql -U etl_user -d stock_db < sql/quarterly_returns.sql
docker exec -i stock_etl_db psql -U etl_user -d stock_db < sql/drop_events.sql
docker exec -i stock_etl_db psql -U etl_user -d stock_db < sql/ml_features.sql
```
 
**6. Open the notebook:**
```bash
jupyter notebook "Recovery Analysis SQL Project.ipynb"
```
 
**7. Or just run the model on its own:**
```bash
python3 -m ml.predict_recovery
```
 
## About run_pipeline.py
 
This one's different from the backfill script. It's meant to run daily to keep prices up to date, not to load 10 years of history at once. Right now it's only wired up for a few tickers through Alpha Vantage since that's what I built it against early on, but the same logic works for all 503 tickers using `extract/yfinance_prices.py`.
 
```bash
python3 run_pipeline.py
```
 
## Stack
 
Python, PostgreSQL, SQLAlchemy, pandas, scikit-learn, Jupyter, pytest
 
 

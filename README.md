# DrawdownIQ

DrawdownIQ is a full-stack market data and ML project that studies major quarterly drawdowns among current S&P 500 constituents and estimates whether stocks still below baseline at quarter-end recover during the next 180 days.

Live demo: [https://stock-etl-pipeline.vercel.app/](https://stock-etl-pipeline.vercel.app/)

## What it does

- Builds SQL-defined drawdown events from daily price history
- Uses quarter-end as the prediction cutoff
- Trains a leakage-audited Logistic Regression classifier
- Serves predictions through FastAPI
- Displays recovery paths and model analysis in React

## Model

- **Active model:** Logistic Regression v3
- **Target:** Recovery to baseline within 180 days after quarter-end
- **Final holdout:** 361 events
- **ROC AUC:** 0.731
- **PR AUC:** 0.596

## Dataset

- 1.3M+ daily price rows
- 1,894 raw drawdown events
- 1,610 clean classifier events
- 476 stocks represented

## Stack

Python, PostgreSQL, SQLAlchemy, scikit-learn, FastAPI, React, Vite, Tailwind CSS, and Recharts.

## Limitations

DrawdownIQ uses current S&P 500 constituents and current sector mappings, so it is not a survivorship-bias-free historical index backtest.

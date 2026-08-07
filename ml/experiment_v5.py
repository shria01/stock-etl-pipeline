"""Targeted multi-horizon recovery experiments; never overwrites the active model."""

import json

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sqlalchemy import text

from load.postgres import get_engine
from ml.predict_recovery import purged_walk_forward_folds


COMPACT_FEATURES = [
    'relative_drop_pct', 'drop_pct', 'event_max_drawdown_pct',
    'drawdown_velocity_pct_per_day', 'volatility_90d',
    'distance_from_52w_high', 'relative_prior_90d_return',
    'sector_relative_drop_pct',
]

SHAPE_FEATURES = COMPACT_FEATURES + [
    'days_underwater_as_of_prediction',
    'pct_days_underwater_in_event_window',
    'number_of_new_lows_in_event_window',
    'bounce_from_event_low_pct',
    'last_20d_return_before_prediction',
    'last_10d_return_before_prediction',
    'slope_20d_before_prediction',
    'ticker_prior_fast_recovery_rate',
    'ticker_prior_median_days_to_recovery',
    'ticker_prior_event_count',
    'ticker_prior_avg_drawdown',
]

TICKER_HISTORY_FEATURES = [
    'ticker_prior_fast_recovery_rate',
    'ticker_prior_median_days_to_recovery',
    'ticker_prior_event_count',
    'ticker_prior_avg_drawdown',
]

FEATURE_SETS = {
    'compact': COMPACT_FEATURES,
    'compact_plus_bounce': COMPACT_FEATURES + ['bounce_from_event_low_pct'],
    'compact_plus_ticker_history': COMPACT_FEATURES + TICKER_HISTORY_FEATURES,
    'shape_and_history': SHAPE_FEATURES,
}


def load_horizon_data(horizon_days):
    query = text(f"""
        WITH latest_prices AS (
            SELECT ticker, MAX(price_date) AS latest_price_date
            FROM stock_prices
            GROUP BY ticker
        )
        SELECT
            de.ticker,
            de.drop_quarter,
            de.prediction_date,
            de.prediction_date + {horizon_days} AS label_end_date,
            s.sector,
            {', '.join(f'de.{column}' for column in SHAPE_FEATURES)},
            CASE
                WHEN de.recovered_date <= de.prediction_date THEN NULL
                WHEN de.recovered_date <= de.prediction_date + {horizon_days} THEN 1
                ELSE 0
            END AS fast_recovery
        FROM drop_events de
        JOIN symbols s ON s.ticker = de.ticker
        JOIN latest_prices lp ON lp.ticker = de.ticker
        WHERE de.ticker <> '^GSPC'
          AND (de.recovered_date IS NULL OR de.recovered_date > de.prediction_date)
          AND lp.latest_price_date >= de.prediction_date + {horizon_days}
          AND de.drop_quarter >= (
              SELECT MAX(drop_quarter) - INTERVAL '10 years'
              FROM drop_events
              WHERE ticker <> '^GSPC'
          )
    """)
    with get_engine().connect() as connection:
        frame = pd.read_sql(query, connection)
    return frame.dropna(subset=['fast_recovery'])


def prepare_fold(train_raw, validation_raw, features):
    train = train_raw.copy()
    validation = validation_raw.copy()
    medians = train[features].replace([np.inf, -np.inf], np.nan).median().fillna(0)

    for frame in (train, validation):
        frame[features] = frame[features].replace([np.inf, -np.inf], np.nan)
        for feature in features:
            frame[f'{feature}_missing'] = frame[feature].isna().astype(int)
        frame[features] = frame[features].fillna(medians).fillna(0)
        frame['sector'] = frame['sector'].fillna('Unknown')

    train = pd.get_dummies(train, columns=['sector'], drop_first=False)
    validation = pd.get_dummies(validation, columns=['sector'], drop_first=False)
    validation = validation.reindex(columns=train.columns, fill_value=0)
    sector_columns = [
        f'sector_{sector}'
        for sector in train_raw['sector'].fillna('Unknown').unique()
        if f'sector_{sector}' in train.columns
    ]
    columns = (
        list(features)
        + [f'{feature}_missing' for feature in features]
        + sector_columns
    )
    return train[columns], train['fast_recovery'], validation[columns], validation['fast_recovery']


def candidate_grid():
    for feature_set in FEATURE_SETS:
        for c in (0.1, 0.5, 1.0):
            yield {'feature_set': feature_set, 'penalty': 'l2', 'c': c, 'l1_ratio': 0.0}
            for l1_ratio in (0.2, 0.5, 0.8):
                yield {
                    'feature_set': feature_set,
                    'penalty': 'elastic_net',
                    'c': c,
                    'l1_ratio': l1_ratio,
                }


def build_model(candidate):
    return Pipeline([
        ('scaler', StandardScaler()),
        ('classifier', LogisticRegression(
            solver='saga',
            l1_ratio=candidate['l1_ratio'],
            C=candidate['c'],
            class_weight='balanced',
            max_iter=3000,
            random_state=42,
        )),
    ])


def evaluate_horizon(horizon_days):
    raw = load_horizon_data(horizon_days)
    folds = purged_walk_forward_folds(raw, n_splits=4)
    results = []
    positive_rate = float(raw['fast_recovery'].mean())

    for candidate in candidate_grid():
        probabilities = []
        outcomes = []
        fold_pr_auc = []
        fold_roc_auc = []
        features = FEATURE_SETS[candidate['feature_set']]

        for train_raw, validation_raw in folds:
            X_train, y_train, X_validation, y_validation = prepare_fold(
                train_raw, validation_raw, features
            )
            model = build_model(candidate)
            model.fit(X_train, y_train)
            probability = model.predict_proba(X_validation)[:, 1]
            fold_pr_auc.append(average_precision_score(y_validation, probability))
            fold_roc_auc.append(roc_auc_score(y_validation, probability))
            probabilities.extend(probability.tolist())
            outcomes.extend(y_validation.tolist())

        results.append({
            **candidate,
            'mean_pr_auc': float(np.mean(fold_pr_auc)),
            'positive_rate': positive_rate,
            'pr_auc_lift_over_prevalence': float(np.mean(fold_pr_auc)) / positive_rate,
            'mean_roc_auc': float(np.mean(fold_roc_auc)),
            'oof_brier_score': float(brier_score_loss(outcomes, probabilities)),
            'events': len(raw),
            'folds': len(folds),
        })

    return sorted(results, key=lambda row: (-row['mean_pr_auc'], -row['mean_roc_auc']))


if __name__ == '__main__':
    report = {}
    for horizon in (90, 180, 365):
        results = evaluate_horizon(horizon)
        best_by_feature_set = {
            feature_set: next(
                result for result in results if result['feature_set'] == feature_set
            )
            for feature_set in FEATURE_SETS
        }
        report[str(horizon)] = {
            'best': results[0],
            'best_by_feature_set': best_by_feature_set,
            'top_five': results[:5],
        }
        print(f"{horizon}-day best: {results[0]}")

    with open('ml/model_v5_experiment.json', 'w', encoding='utf-8') as output:
        json.dump(report, output, indent=2)

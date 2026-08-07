"""Discrete-time recovery survival experiment with right-censored events."""

import json
from functools import lru_cache

import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, log_loss, roc_auc_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sqlalchemy import text

from load.postgres import get_engine


BUCKETS = [(0, 30), (30, 60), (60, 90), (90, 180), (180, 365)]
FEATURES = [
    'relative_drop_pct', 'drop_pct', 'event_max_drawdown_pct',
    'drawdown_velocity_pct_per_day', 'volatility_90d',
    'distance_from_52w_high', 'relative_prior_90d_return',
    'sector_relative_drop_pct', 'ticker_prior_fast_recovery_rate',
    'ticker_prior_median_days_to_recovery', 'ticker_prior_event_count',
    'ticker_prior_avg_drawdown',
]


def load_events():
    query = text(f"""
        WITH latest_prices AS (
            SELECT ticker, MAX(price_date) AS latest_price_date
            FROM stock_prices
            GROUP BY ticker
        )
        SELECT
            de.id AS event_id,
            de.ticker,
            de.prediction_date,
            de.recovered_date,
            lp.latest_price_date,
            s.sector,
            {', '.join(f'de.{feature}' for feature in FEATURES)}
        FROM drop_events de
        JOIN symbols s ON s.ticker = de.ticker
        JOIN latest_prices lp ON lp.ticker = de.ticker
        WHERE de.ticker <> '^GSPC'
          AND (de.recovered_date IS NULL OR de.recovered_date > de.prediction_date)
          AND de.drop_quarter >= (
              SELECT MAX(drop_quarter) - INTERVAL '10 years'
              FROM drop_events
              WHERE ticker <> '^GSPC'
          )
    """)
    with get_engine().connect() as connection:
        return pd.read_sql(query, connection)


def expand_observed_hazard_rows(events):
    """Keep each fully observed interval and the interval containing recovery."""
    rows = []
    for event in events.to_dict('records'):
        prediction_date = pd.Timestamp(event['prediction_date'])
        recovery_date = (
            pd.Timestamp(event['recovered_date'])
            if pd.notna(event['recovered_date']) else None
        )
        latest_date = pd.Timestamp(event['latest_price_date'])

        for bucket_index, (start_day, end_day) in enumerate(BUCKETS):
            bucket_end_date = prediction_date + pd.Timedelta(days=end_day)
            recovered_in_bucket = (
                recovery_date is not None
                and recovery_date <= bucket_end_date
            )
            fully_observed = latest_date >= bucket_end_date

            if not recovered_in_bucket and not fully_observed:
                break

            rows.append({
                **event,
                'bucket_index': bucket_index,
                'hazard_bucket': f'{start_day + 1}-{end_day}',
                'bucket_end_date': bucket_end_date,
                'label_available_date': recovery_date if recovered_in_bucket else bucket_end_date,
                'recovered_in_bucket': int(recovered_in_bucket),
            })
            if recovered_in_bucket:
                break

    expanded = pd.DataFrame(rows)
    if not expanded.empty:
        expanded['prediction_date'] = pd.to_datetime(expanded['prediction_date'])
        expanded['label_available_date'] = pd.to_datetime(expanded['label_available_date'])
    return expanded


def expanding_event_folds(events, n_splits=4):
    events = events.copy()
    events['prediction_date'] = pd.to_datetime(events['prediction_date'])
    dates = np.array(sorted(events['prediction_date'].dropna().unique()))
    initial_dates = max(4, len(dates) // 3)
    blocks = np.array_split(dates[initial_dates:], n_splits)
    folds = []
    for block in blocks:
        if len(block) == 0:
            continue
        start = pd.Timestamp(block[0])
        end = pd.Timestamp(block[-1])
        validation_ids = events.loc[
            (events['prediction_date'] >= start) & (events['prediction_date'] <= end),
            'event_id',
        ]
        folds.append((start, validation_ids.tolist()))
    return folds


def prepare_matrices(train_rows, scoring_rows):
    train = train_rows.copy()
    scoring = scoring_rows.copy()
    medians = train[FEATURES].replace([np.inf, -np.inf], np.nan).median().fillna(0)
    for frame in (train, scoring):
        frame[FEATURES] = frame[FEATURES].replace([np.inf, -np.inf], np.nan)
        for feature in FEATURES:
            frame[f'{feature}_missing'] = frame[feature].isna().astype(int)
        frame[FEATURES] = frame[FEATURES].fillna(medians).fillna(0)
        frame['sector'] = frame['sector'].fillna('Unknown')
    train = pd.get_dummies(train, columns=['sector', 'hazard_bucket'], drop_first=False)
    scoring = pd.get_dummies(scoring, columns=['sector', 'hazard_bucket'], drop_first=False)
    scoring = scoring.reindex(columns=train.columns, fill_value=0)
    excluded = {
        'event_id', 'ticker', 'prediction_date', 'recovered_date', 'latest_price_date',
        'bucket_index', 'bucket_end_date', 'label_available_date', 'recovered_in_bucket',
    }
    columns = [column for column in train.columns if column not in excluded]
    return train[columns], train['recovered_in_bucket'], scoring[columns]


def all_bucket_rows(events):
    rows = []
    for event in events.to_dict('records'):
        prediction_date = pd.Timestamp(event['prediction_date'])
        for bucket_index, (start_day, end_day) in enumerate(BUCKETS):
            rows.append({
                **event,
                'bucket_index': bucket_index,
                'hazard_bucket': f'{start_day + 1}-{end_day}',
                'bucket_end_date': prediction_date + pd.Timedelta(days=end_day),
            })
    return pd.DataFrame(rows)


def build_model(c, class_weight=None):
    return Pipeline([
        ('scaler', StandardScaler()),
        ('classifier', LogisticRegression(
            C=c,
            class_weight=class_weight,
            max_iter=2000,
            random_state=42,
        )),
    ])


def cumulative_recovery_predictions(scoring_rows, hazard_probability):
    scored = scoring_rows[['event_id', 'bucket_index']].copy()
    scored['hazard_probability'] = hazard_probability
    scored = scored.sort_values(['event_id', 'bucket_index'])
    scored['recovery_probability'] = 1 - scored.groupby('event_id')[
        'hazard_probability'
    ].transform(lambda values: (1 - values).cumprod())
    return scored


@lru_cache(maxsize=1)
def get_survival_model_data(artifact_path='ml/recovery_survival_model.pkl'):
    return joblib.load(artifact_path)


def predict_survival(feature_dict, artifact_path='ml/recovery_survival_model.pkl'):
    artifact = get_survival_model_data(artifact_path)
    rows = []
    for bucket_index, (start_day, end_day) in enumerate(artifact['buckets']):
        rows.append({
            **feature_dict,
            'bucket_index': bucket_index,
            'hazard_bucket': f'{start_day + 1}-{end_day}',
        })
    frame = pd.DataFrame(rows)
    features = artifact['features']
    for feature in features:
        frame[feature] = pd.to_numeric(frame.get(feature), errors='coerce')
        frame[f'{feature}_missing'] = frame[feature].isna().astype(int)
    frame[features] = frame[features].fillna(artifact['medians']).fillna(0)
    frame['sector'] = frame.get('sector', pd.Series(['Unknown'] * len(frame))).fillna('Unknown')
    frame = pd.get_dummies(frame, columns=['sector', 'hazard_bucket'], drop_first=False)
    frame = frame.reindex(columns=artifact['feature_columns'], fill_value=0)
    hazard = artifact['model'].predict_proba(frame)[:, 1]
    cumulative = 1 - np.cumprod(1 - hazard)
    return [
        {
            'horizon_days': end_day,
            'conditional_recovery_probability': float(hazard[index]),
            'cumulative_recovery_probability': float(cumulative[index]),
        }
        for index, (_, end_day) in enumerate(artifact['buckets'])
    ]


def evaluate_configuration(events, hazard_rows, c, class_weight=None):
    hazard_losses = []
    horizon_records = []

    for validation_start, validation_ids in expanding_event_folds(events):
        train_rows = hazard_rows[
            (hazard_rows['prediction_date'] < validation_start)
            & (hazard_rows['label_available_date'] < validation_start)
        ]
        validation_observed = hazard_rows[hazard_rows['event_id'].isin(validation_ids)]
        validation_events = events[events['event_id'].isin(validation_ids)]
        scoring_rows = all_bucket_rows(validation_events)

        X_train, y_train, X_validation_observed = prepare_matrices(
            train_rows, validation_observed
        )
        _, _, X_scoring = prepare_matrices(train_rows, scoring_rows)
        model = build_model(c, class_weight=class_weight)
        model.fit(X_train, y_train)
        observed_probability = model.predict_proba(X_validation_observed)[:, 1]
        hazard_losses.append(log_loss(
            validation_observed['recovered_in_bucket'], observed_probability, labels=[0, 1]
        ))
        curve = cumulative_recovery_predictions(
            scoring_rows, model.predict_proba(X_scoring)[:, 1]
        )

        for event in validation_events.to_dict('records'):
            prediction_date = pd.Timestamp(event['prediction_date'])
            recovery_date = (
                pd.Timestamp(event['recovered_date'])
                if pd.notna(event['recovered_date']) else None
            )
            latest_date = pd.Timestamp(event['latest_price_date'])
            event_curve = curve[curve['event_id'] == event['event_id']]
            for bucket_index, (_, horizon) in enumerate(BUCKETS):
                horizon_end = prediction_date + pd.Timedelta(days=horizon)
                if recovery_date is not None and recovery_date <= horizon_end:
                    outcome = 1
                elif latest_date >= horizon_end:
                    outcome = 0
                else:
                    continue
                probability = event_curve.loc[
                    event_curve['bucket_index'] == bucket_index, 'recovery_probability'
                ].iloc[0]
                horizon_records.append({
                    'horizon': horizon,
                    'outcome': outcome,
                    'probability': probability,
                })

    return float(np.mean(hazard_losses)), pd.DataFrame(horizon_records)


if __name__ == '__main__':
    event_data = load_events()
    observed_rows = expand_observed_hazard_rows(event_data)
    candidates = []
    for class_weight in (None, 'balanced'):
        for c in (0.1, 0.5, 1.0, 2.0):
            hazard_log_loss, predictions = evaluate_configuration(
                event_data, observed_rows, c, class_weight=class_weight
            )
            candidates.append((hazard_log_loss, c, class_weight, predictions))
            print(
                f'C={c}, class_weight={class_weight}: '
                f'walk-forward hazard log loss={hazard_log_loss:.4f}'
            )

    best_loss, best_c, best_class_weight, predictions = min(
        candidates, key=lambda result: result[0]
    )
    report = {
        'events': len(event_data),
        'observed_hazard_rows': len(observed_rows),
        'selected_c': best_c,
        'selected_class_weight': best_class_weight,
        'walk_forward_hazard_log_loss': best_loss,
        'horizons': {},
    }
    for horizon, group in predictions.groupby('horizon'):
        report['horizons'][str(horizon)] = {
            'events': len(group),
            'positive_rate': float(group['outcome'].mean()),
            'roc_auc': float(roc_auc_score(group['outcome'], group['probability'])),
            'pr_auc': float(average_precision_score(group['outcome'], group['probability'])),
            'brier_score': float(brier_score_loss(group['outcome'], group['probability'])),
        }

    with open('ml/survival_model_report.json', 'w', encoding='utf-8') as output:
        json.dump(report, output, indent=2)

    all_scoring_rows = all_bucket_rows(event_data)
    X_all, y_all, _ = prepare_matrices(observed_rows, all_scoring_rows)
    final_model = build_model(best_c, class_weight=best_class_weight)
    final_model.fit(X_all, y_all)
    medians = observed_rows[FEATURES].replace([np.inf, -np.inf], np.nan).median().fillna(0)
    joblib.dump({
        'model': final_model,
        'model_name': 'discrete_time_hazard_logistic_regression',
        'model_version': 'survival-v1-research',
        'features': FEATURES,
        'feature_columns': X_all.columns.tolist(),
        'medians': medians,
        'buckets': BUCKETS,
        'metrics': report,
    }, 'ml/recovery_survival_model.pkl')
    print(json.dumps(report, indent=2))

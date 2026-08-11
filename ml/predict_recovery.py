import joblib
import numpy as np
import pandas as pd
from sqlalchemy import text
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestClassifier, HistGradientBoostingClassifier
from load.postgres import get_engine
from sklearn.metrics import accuracy_score, classification_report
from sklearn.metrics import (
    roc_auc_score, average_precision_score, f1_score, precision_score, recall_score,
    balanced_accuracy_score
)


NUMERIC_COLS = [
    'drop_pct', 'event_max_drawdown_pct', 'drawdown_velocity_pct_per_day', 'volatility_90d',
    'prior_90d_return', 'volume_change_pct', 'distance_from_52w_high',
    'relative_drop_pct', 'relative_prior_90d_return', 'sector_relative_drop_pct',
    'sp500_volatility_90d', 'sp500_return_20d', 'sp500_return_90d',
    'sp500_distance_from_52w_high', 'market_breadth_below_200d'
]

MARKET_REGIME_COLS = {
    'sp500_volatility_90d', 'sp500_return_20d', 'sp500_return_90d',
    'sp500_distance_from_52w_high', 'market_breadth_below_200d'
}

NON_FEATURE_COLS = {
    'ticker', 'drop_quarter', 'prediction_date', 'label_end_date', 'fast_recovery'
}

cached_model_data = None

def get_model_data():
    global cached_model_data
    if cached_model_data is None:
        cached_model_data = joblib.load("ml/recovery_model.pkl")
    return cached_model_data

def load_training_data():
    query = text("""
        SELECT
            de.ticker,
            de.drop_quarter,
            de.prediction_date,
            de.label_end_date,
            s.sector,
            de.drop_pct,
            de.event_max_drawdown_pct,
            de.drawdown_velocity_pct_per_day,
            de.volatility_90d,
            de.prior_90d_return,
            de.volume_change_pct,
            de.distance_from_52w_high,
            de.relative_drop_pct,
            de.relative_prior_90d_return,
            de.sector_relative_drop_pct,
            de.sp500_volatility_90d,
            de.sp500_return_20d,
            de.sp500_return_90d,
            de.sp500_distance_from_52w_high,
            de.market_breadth_below_200d,
            de.recovered_within_180d_after_prediction::int AS fast_recovery
        FROM drop_events de
        JOIN symbols s ON de.ticker = s.ticker
        WHERE de.ticker != '^GSPC'
            AND de.relative_prior_90d_return IS NOT NULL
            AND de.recovered_within_180d_after_prediction IS NOT NULL
            AND de.drop_quarter >= (
                SELECT MAX(drop_quarter) - INTERVAL '10 years'
                FROM drop_events
                WHERE ticker != '^GSPC'
            )
    """)
    engine = get_engine()
    with engine.connect() as conn:
        df = pd.read_sql(query, conn)
    return df


def prepare_features(df, medians=None):
    df = df.copy()
    df = df.reindex(columns=df.columns.union(NUMERIC_COLS, sort=False))

    # Treat non-finite derived values as missing before creating indicators.
    df[NUMERIC_COLS] = df[NUMERIC_COLS].replace([float('inf'), float('-inf')], pd.NA)

    for col in NUMERIC_COLS:
        df[f"{col}_missing"] = df[col].isna().astype(int)

    if medians is None:
        medians = df[NUMERIC_COLS].median().fillna(0)
    else:
        # A newly introduced or entirely-null training feature has no usable
        # median. Zero is a neutral fallback and its missing indicator remains 1.
        medians = pd.Series(medians).reindex(NUMERIC_COLS).fillna(0)

    df[NUMERIC_COLS] = df[NUMERIC_COLS].fillna(medians).fillna(0)
    df['sector'] = df['sector'].fillna('Unknown')
    df = pd.get_dummies(df, columns=['sector'], drop_first=False)
    return df, medians


def time_based_split_raw(df):
    df = df.copy()
    df['drop_quarter'] = pd.to_datetime(df['drop_quarter'])
    df['prediction_date'] = pd.to_datetime(df['prediction_date'])
    df['label_end_date'] = pd.to_datetime(df['label_end_date'])
    df = df.sort_values('prediction_date')

    val_start = df['prediction_date'].quantile(0.6)
    test_start = df['prediction_date'].quantile(0.8)

    # Purge rows whose 180-day labels would not have been observable when the
    # next evaluation period begins.
    train_df = df[df['label_end_date'] < val_start]
    val_df = df[
        (df['prediction_date'] >= val_start) &
        (df['label_end_date'] < test_start)
    ]
    test_df = df[df['prediction_date'] >= test_start]

    return train_df, val_df, test_df


def final_holdout_split_raw(df, holdout_quantile=0.8):
    """Freeze a final cohort and purge development labels crossing its start."""
    df = df.copy()
    df['prediction_date'] = pd.to_datetime(df['prediction_date'])
    df['label_end_date'] = pd.to_datetime(df['label_end_date'])
    holdout_start = df['prediction_date'].quantile(holdout_quantile)
    development = df[df['label_end_date'] < holdout_start].copy()
    holdout = df[df['prediction_date'] >= holdout_start].copy()
    return development, holdout, holdout_start


def purged_walk_forward_folds(df, n_splits=4):
    """Expanding-window folds with label horizons purged before validation."""
    df = df.copy()
    df['prediction_date'] = pd.to_datetime(df['prediction_date'])
    df['label_end_date'] = pd.to_datetime(df['label_end_date'])
    dates = np.array(sorted(df['prediction_date'].dropna().unique()))
    initial_dates = max(4, len(dates) // 3)
    validation_dates = np.array_split(dates[initial_dates:], n_splits)
    folds = []

    for date_block in validation_dates:
        if len(date_block) == 0:
            continue
        validation_start = pd.Timestamp(date_block[0])
        validation_end = pd.Timestamp(date_block[-1])
        train = df[df['label_end_date'] < validation_start].copy()
        validation = df[
            (df['prediction_date'] >= validation_start) &
            (df['prediction_date'] <= validation_end)
        ].copy()
        if not train.empty and not validation.empty:
            folds.append((train, validation))

    return folds


def train_random_forest(X_train, y_train, X_test):
    model = RandomForestClassifier(
        n_estimators=300,
        max_depth=5,
        min_samples_leaf=15,
        max_features='sqrt',
        class_weight='balanced',
        random_state=42
    )

    model.fit(X_train, y_train)
    y_proba = model.predict_proba(X_test)[:, 1]
    return model, y_proba

def train_gradient_boosting(X_train, y_train, X_test):
    model = HistGradientBoostingClassifier(
        max_iter=200,
        learning_rate=0.05,
        max_leaf_nodes=15,
        random_state=42
    )
    model.fit(X_train, y_train)
    y_proba = model.predict_proba(X_test)[:, 1]
    return model, y_proba


def build_candidate_model(candidate):
    if candidate['kind'] == 'elastic_net':
        return Pipeline([
            ('scaler', StandardScaler()),
            ('clf', LogisticRegression(
                solver='saga',
                l1_ratio=candidate['l1_ratio'],
                C=candidate['c'],
                class_weight='balanced',
                max_iter=3000,
                random_state=42,
            )),
        ])
    if candidate['kind'] == 'hist_gradient_boosting':
        return HistGradientBoostingClassifier(
            max_iter=250,
            learning_rate=0.05,
            max_leaf_nodes=candidate['max_leaf_nodes'],
            l2_regularization=candidate['l2_regularization'],
            random_state=42,
        )
    raise ValueError(f"Unknown candidate kind: {candidate['kind']}")


def candidate_grid():
    candidates = [
        {'kind': 'elastic_net', 'c': c, 'l1_ratio': l1_ratio}
        for c in (0.1, 0.5, 1.0)
        for l1_ratio in (0.2, 0.5, 0.8)
    ]
    candidates.extend(
        {
            'kind': 'hist_gradient_boosting',
            'max_leaf_nodes': leaves,
            'l2_regularization': l2,
        }
        for leaves in (7, 15)
        for l2 in (0.1, 1.0)
    )
    return candidates


def evaluate_candidates_walk_forward(raw_df):
    folds = purged_walk_forward_folds(raw_df)
    results = []

    for candidate in candidate_grid():
        fold_pr_auc = []
        fold_roc_auc = []
        oof_y = []
        oof_proba = []

        for train_raw, validation_raw in folds:
            train, medians = prepare_features(train_raw)
            validation, _ = prepare_features(validation_raw, medians=medians)
            validation = validation.reindex(columns=train.columns, fill_value=0)
            feature_columns = [c for c in train.columns if c not in NON_FEATURE_COLS]
            X_train, y_train = train[feature_columns], train['fast_recovery']
            X_validation = validation[feature_columns]
            y_validation = validation['fast_recovery']

            model = build_candidate_model(candidate)
            model.fit(X_train, y_train)
            probability = model.predict_proba(X_validation)[:, 1]
            fold_pr_auc.append(average_precision_score(y_validation, probability))
            fold_roc_auc.append(roc_auc_score(y_validation, probability))
            oof_y.extend(y_validation.tolist())
            oof_proba.extend(probability.tolist())

        results.append({
            'candidate': candidate,
            'mean_pr_auc': float(np.mean(fold_pr_auc)),
            'mean_roc_auc': float(np.mean(fold_roc_auc)),
            'oof_y': np.asarray(oof_y),
            'oof_proba': np.asarray(oof_proba),
            'folds': len(folds),
        })

    return max(results, key=lambda result: (result['mean_pr_auc'], result['mean_roc_auc']))


def select_oof_threshold(y_true, probability):
    best_threshold = 0.5
    best_score = -1
    for threshold in np.arange(0.25, 0.76, 0.01):
        score = balanced_accuracy_score(y_true, probability >= threshold)
        if score > best_score:
            best_score = score
            best_threshold = float(threshold)
    return best_threshold, best_score


def train_active_v3(raw_df, output_path='ml/recovery_model.pkl', verbose=False):
    """Train and save the active Logistic Regression v3 classifier."""
    train_raw, _validation_raw, test_raw = time_based_split_raw(raw_df)
    train, medians = prepare_features(train_raw)
    test, _ = prepare_features(test_raw, medians=medians)
    test = test.reindex(columns=train.columns, fill_value=0)
    excluded = MARKET_REGIME_COLS | {f'{column}_missing' for column in MARKET_REGIME_COLS}
    feature_columns = [
        column for column in train.columns
        if column not in NON_FEATURE_COLS and column not in excluded
    ]
    X_train, y_train = train[feature_columns], train['fast_recovery']
    X_test, y_test = test[feature_columns], test['fast_recovery']
    model, probability = train_logistic_model(
        X_train, y_train, X_test, c=0.5, class_weight='balanced'
    )
    prediction = probability >= 0.5

    if verbose:
        print(f"Training events: {len(X_train)}")
        print(f"Final holdout events: {len(X_test)}")
        evaluate_majority_baseline(y_test)
        evaluate_model("Logistic Regression v3", y_test, probability, threshold=0.5)
        show_logistic_coefficients(model, X_train)
        print("\nFinal holdout probability buckets:")
        show_probability_buckets(y_test, probability)

    artifact = {
        'model': model,
        'feature_columns': feature_columns,
        'medians': medians,
        'threshold': 0.5,
        'model_name': 'logistic_regression',
        'model_version': 'v3',
        'metrics': {
            'test_auc': round(roc_auc_score(y_test, probability), 4),
            'test_average_precision': round(average_precision_score(y_test, probability), 4),
            'test_accuracy': round(accuracy_score(y_test, prediction), 4),
            'test_f1': round(f1_score(y_test, prediction), 4),
            'test_precision': round(precision_score(y_test, prediction), 4),
            'test_recall': round(recall_score(y_test, prediction), 4),
            'baseline_accuracy': round(accuracy_score(y_test, pd.Series(0, index=y_test.index)), 4),
            'selected_c': 0.5,
            'selected_class_weight': 'balanced',
            'training_events': len(X_train),
            'test_events': len(X_test),
        },
    }
    joblib.dump(artifact, output_path)
    return artifact

def train_logistic_model(X_train, y_train, X_test, c=0.1, class_weight="balanced"):
    log_model = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", LogisticRegression(class_weight=class_weight, max_iter=1000, C=c))
    ])

    log_model.fit(X_train, y_train)
    y_proba = log_model.predict_proba(X_test)[:, 1]
    return log_model, y_proba

def show_logistic_coefficients(model, X):
    coefs = model.named_steps['clf'].coef_[0]
    coef_series = pd.Series(coefs, index=X.columns).sort_values(key=abs, ascending=False)
    print("\nLogistic Regression coefficients (standardized):")
    print(coef_series.head(10))

def find_best_threshold(y_val, y_proba, thresholds=None):
    if thresholds is None:
        thresholds = [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6]

    print("\nThreshold sweep:")
    best_threshold, best_f1 = 0.5, 0
    for t in thresholds:
        y_pred = (y_proba >= t).astype(int)
        f1 = f1_score(y_val, y_pred)
        print(f"  Threshold {t}: F1 = {f1:.3f}")
        if f1 > best_f1:
            best_threshold, best_f1 = t, f1

    print(f"Best threshold: {best_threshold} (F1 = {best_f1:.3f})")
    return best_threshold


def sweep_logistic_regularization(X_train, y_train, X_val, y_val, threshold=0.5):
    print("\nLogistic Regression regularization sweep:")
    best_c, best_f1 = 1.0, 0

    for c in [0.1, 0.5, 1.0, 2.0, 5.0]:
        _, y_proba = train_logistic_model(X_train, y_train, X_val, c=c)
        y_pred = (y_proba >= threshold).astype(int)
        f1 = f1_score(y_val, y_pred)
        print(f"  C={c}: F1 = {f1:.3f}")
        if f1 > best_f1:
            best_c, best_f1 = c, f1

    print(f"Best C: {best_c} (F1 = {best_f1:.3f})")
    return best_c


def select_logistic_configuration(X_train, y_train, X_val, y_val):
    """Choose regularization, weighting, and threshold using validation only."""
    thresholds = [value / 100 for value in range(20, 81, 2)]
    best = None

    print("\nLogistic Regression validation selection (accuracy objective):")
    for class_weight in ("balanced", None):
        for c in (0.1, 0.5, 1.0, 2.0, 5.0):
            _, val_proba = train_logistic_model(
                X_train, y_train, X_val, c=c, class_weight=class_weight
            )
            val_auc = roc_auc_score(y_val, val_proba)

            for threshold in thresholds:
                val_pred = (val_proba >= threshold).astype(int)
                candidate = {
                    "c": c,
                    "class_weight": class_weight,
                    "threshold": threshold,
                    "accuracy": accuracy_score(y_val, val_pred),
                    "f1": f1_score(y_val, val_pred),
                    "roc_auc": val_auc,
                }
                score = (candidate["accuracy"], candidate["f1"], candidate["roc_auc"])
                if best is None or score > best["score"]:
                    best = {**candidate, "score": score}

        weight_label = class_weight if class_weight is not None else "none"
        print(f"  evaluated class_weight={weight_label}")

    print(
        "Selected: "
        f"C={best['c']}, class_weight={best['class_weight']}, "
        f"threshold={best['threshold']:.2f}, "
        f"val_accuracy={best['accuracy']:.3f}, val_f1={best['f1']:.3f}, "
        f"val_roc_auc={best['roc_auc']:.3f}"
    )
    return best



def evaluate_model(name, y_test, y_proba, threshold):
    y_pred = (y_proba >= threshold).astype(int)

    print(f"\n=== {name} (threshold={threshold}) ===")
    print(f"Accuracy: {accuracy_score(y_test, y_pred):.3f}")
    print(f"ROC AUC: {roc_auc_score(y_test, y_proba):.3f}")
    print(f"PR AUC: {average_precision_score(y_test, y_proba):.3f}")
    print(classification_report(y_test, y_pred))


def show_feature_importance(model, X):
    importances = pd.Series(model.feature_importances_, index=X.columns)
    importances = importances.sort_values(ascending=False)

    print("\nFeature importance (Random Forest):")
    print(importances.head(10))


def show_probability_buckets(y_test, y_proba):
    results = pd.DataFrame({"y_true": y_test.values, "y_proba": y_proba})
    results["prob_bucket"] = pd.qcut(results["y_proba"], 5, duplicates="drop")

    summary = results.groupby("prob_bucket")["y_true"].agg(
        actual_fast_recovery_rate="mean", count="count"
    )
    print(summary)

def predict_recovery(feature_dict: dict) -> dict:
    data = get_model_data()
    model = data["model"]
    feature_columns = data["feature_columns"]
    medians = data["medians"]
    threshold = data.get("threshold", 0.5)
    model_version = data.get("model_version", "unknown")

    row = pd.DataFrame([feature_dict])
    expected_raw_cols = NUMERIC_COLS + ['sector']
    row = row.reindex(columns=row.columns.union(expected_raw_cols, sort=False), fill_value=pd.NA)
    row, _ = prepare_features(row, medians=medians)
    row = row.reindex(columns=feature_columns, fill_value=0)

    prob = float(model.predict_proba(row)[:, 1][0])
    return {
        "probability": prob,
        "threshold": threshold,
        "predicted_fast_recovery": prob >= threshold,
        "model_version": model_version
    }

def evaluate_majority_baseline(y_test):
    y_pred = pd.Series(0, index=y_test.index)
    print("\n=== Majority Class Baseline ===")
    print(f"Accuracy: {accuracy_score(y_test, y_pred):.3f}")
    print(classification_report(y_test, y_pred, zero_division=0))

if __name__ == "__main__":
    raw_df = load_training_data()
    print(f"Loaded {len(raw_df)} events")
    print("Training active Logistic Regression v3 (C=0.5, balanced classes, threshold=0.50)")
    artifact = train_active_v3(raw_df, verbose=True)
    print(
        "\nSaved active model to ml/recovery_model.pkl "
        f"(version={artifact['model_version']}, ROC AUC={artifact['metrics']['test_auc']:.4f}, "
        f"PR AUC={artifact['metrics']['test_average_precision']:.4f})"
    )

import joblib
import pandas as pd
from sqlalchemy import text
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestClassifier, HistGradientBoostingClassifier
from load.postgres import get_engine
from sklearn.metrics import accuracy_score, classification_report
from sklearn.metrics import roc_auc_score, average_precision_score, f1_score

NUMERIC_COLS = [
    'drop_pct', 'max_drawdown_pct', 'volatility_90d',
    'prior_90d_return', 'volume_change_pct', 'distance_from_52w_high',
    'relative_drop_pct', 'relative_prior_90d_return', 'sector_relative_drop_pct'
]

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
            s.sector,
            de.drop_pct,
            de.max_drawdown_pct,
            de.volatility_90d,
            de.prior_90d_return,
            de.volume_change_pct,
            de.distance_from_52w_high,
            de.relative_drop_pct,
            de.relative_prior_90d_return,
            de.sector_relative_drop_pct,
            CASE 
                WHEN de.days_to_recovery IS NOT NULL 
                    AND de.days_to_recovery <= 180 
                THEN 1 
                ELSE 0 
            END AS fast_recovery
        FROM drop_events de
        JOIN symbols s ON de.ticker = s.ticker
        WHERE de.ticker != '^GSPC'
            AND de.relative_prior_90d_return IS NOT NULL
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

    for col in NUMERIC_COLS:
        df[f"{col}_missing"] = df[col].isna().astype(int)

    if medians is None:
        medians = df[NUMERIC_COLS].median()

    df[NUMERIC_COLS] = df[NUMERIC_COLS].fillna(medians)
    df['sector'] = df['sector'].fillna('Unknown')
    df = pd.get_dummies(df, columns=['sector'], drop_first=False)
    return df, medians


def time_based_split_raw(df):
    df = df.copy()
    df['drop_quarter'] = pd.to_datetime(df['drop_quarter'])
    df = df.sort_values('drop_quarter')

    train_cutoff = df['drop_quarter'].quantile(0.6)
    val_cutoff = df['drop_quarter'].quantile(0.8)

    train_df = df[df['drop_quarter'] < train_cutoff]
    val_df = df[(df['drop_quarter'] >= train_cutoff) & (df['drop_quarter'] < val_cutoff)]
    test_df = df[df['drop_quarter'] >= val_cutoff]

    return train_df, val_df, test_df


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

def train_logistic_model(X_train, y_train, X_test, c=0.1):
    log_model = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", LogisticRegression(class_weight="balanced", max_iter=1000, C=c))
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

    row = pd.DataFrame([feature_dict])
    expected_raw_cols = NUMERIC_COLS + ['sector']
    row = row.reindex(columns=row.columns.union(expected_raw_cols, sort=False), fill_value=pd.NA)
    row, _ = prepare_features(row, medians=medians)
    row = row.reindex(columns=feature_columns, fill_value=0)

    prob = float(model.predict_proba(row)[:, 1][0])
    return {
        "probability": prob,
        "threshold": threshold,
        "predicted_fast_recovery": prob >= threshold
    }

def evaluate_majority_baseline(y_test):
    y_pred = pd.Series(0, index=y_test.index)
    print("\n=== Majority Class Baseline ===")
    print(f"Accuracy: {accuracy_score(y_test, y_pred):.3f}")
    print(classification_report(y_test, y_pred, zero_division=0))

if __name__ == "__main__":
    raw_df = load_training_data()
    print(f"Loaded {len(raw_df)} events")

    train_df, val_df, test_df = time_based_split_raw(raw_df)

    train_df, medians = prepare_features(train_df)
    val_df, _ = prepare_features(val_df, medians=medians)
    test_df, _ = prepare_features(test_df, medians=medians)

    val_df = val_df.reindex(columns=train_df.columns, fill_value=0)
    test_df = test_df.reindex(columns=train_df.columns, fill_value=0)

    feature_cols = [
        c for c in train_df.columns
        if c not in ('ticker', 'drop_quarter', 'fast_recovery')
    ]

    X_train, y_train = train_df[feature_cols], train_df['fast_recovery']
    X_val, y_val = val_df[feature_cols], val_df['fast_recovery']
    X_test, y_test = test_df[feature_cols], test_df['fast_recovery']

    print(f"Train: {len(X_train)} events")
    print(f"Val:   {len(X_val)} events")
    print(f"Test:  {len(X_test)} events")

    evaluate_majority_baseline(y_test)
    # Random Forest: report at default threshold 0.5, no threshold tuning as headline
    rf_model, rf_test_proba = train_random_forest(X_train, y_train, X_test)
    evaluate_model("Random Forest", y_test, rf_test_proba, threshold=0.5)

    # Logistic Regression: tune C on validation only, report at default threshold 0.5
    best_c = sweep_logistic_regularization(X_train, y_train, X_val, y_val)
    log_model, log_test_proba = train_logistic_model(X_train, y_train, X_test, c=best_c)
    evaluate_model("Logistic Regression", y_test, log_test_proba, threshold=0.5)

    joblib.dump({
        "model": log_model,
        "feature_columns": X_train.columns.tolist(),
        "medians": medians,
        "threshold": 0.5,
        "model_name": "logistic_regression",
        "model_version": "v1"
    }, "ml/recovery_model.pkl")

    # Gradient Boosting: same, default threshold
    gb_model, gb_test_proba = train_gradient_boosting(X_train, y_train, X_test)
    evaluate_model("Gradient Boosting", y_test, gb_test_proba, threshold=0.5)

    show_feature_importance(rf_model, X_train)
    show_logistic_coefficients(log_model, X_train)

    print("\nRandom Forest probability buckets:")
    show_probability_buckets(y_test, rf_test_proba)

    print("\nLogistic Regression probability buckets:")
    show_probability_buckets(y_test, log_test_proba)
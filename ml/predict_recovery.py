import pandas as pd
from sqlalchemy import text
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestClassifier
from load.postgres import get_engine
from sklearn.metrics import accuracy_score, classification_report
from sklearn.metrics import roc_auc_score, average_precision_score, f1_score


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
            CASE 
                WHEN de.days_to_recovery IS NOT NULL 
                 AND de.days_to_recovery <= 180 
                THEN 1 
                ELSE 0 
            END AS fast_recovery
        FROM drop_events de
        JOIN symbols s ON de.ticker = s.ticker
    """)
    engine = get_engine()
    with engine.connect() as conn:
        df = pd.read_sql(query, conn)
    return df


def prepare_features(df):
    numeric_cols = [
        'drop_pct', 'max_drawdown_pct', 'volatility_90d',
        'prior_90d_return', 'volume_change_pct', 'distance_from_52w_high'
    ]
    df = df.copy()

    for col in numeric_cols:
        df[f"{col}_missing"] = df[col].isna().astype(int)

    df[numeric_cols] = df[numeric_cols].fillna(df[numeric_cols].median())
    df['sector'] = df['sector'].fillna('Unknown')
    df = pd.get_dummies(df, columns=['sector'], drop_first=False)
    return df


def time_based_split(df):
    df = df.copy()
    df['drop_quarter'] = pd.to_datetime(df['drop_quarter'])
    df = df.sort_values('drop_quarter')

    cutoff = df['drop_quarter'].quantile(0.8)

    train_df = df[df['drop_quarter'] < cutoff]
    test_df = df[df['drop_quarter'] >= cutoff]

    feature_cols = [
        c for c in df.columns
        if c not in ('ticker', 'drop_quarter', 'fast_recovery')
    ]

    X_train, y_train = train_df[feature_cols], train_df['fast_recovery']
    X_test, y_test = test_df[feature_cols], test_df['fast_recovery']

    return X_train, X_test, y_train, y_test


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

def find_best_threshold(y_test, y_proba, thresholds=None):
    if thresholds is None:
        thresholds = [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6]

    print("\nThreshold sweep:")
    best_threshold, best_f1 = 0.5, 0
    for t in thresholds:
        y_pred_t = (y_proba >= t).astype(int)
        f1 = f1_score(y_test, y_pred_t)
        print(f"  Threshold {t}: F1 = {f1:.3f}")
        if f1 > best_f1:
            best_threshold, best_f1 = t, f1

    print(f"Best threshold: {best_threshold} (F1 = {best_f1:.3f})")
    return best_threshold


def sweep_logistic_regularization(X_train, y_train, X_test, y_test, threshold=0.5):
    print("\nLogistic Regression regularization sweep:")
    best_c, best_f1 = 1.0, 0

    for c in [0.1, 0.5, 1.0, 2.0, 5.0]:
        _, y_proba = train_logistic_model(X_train, y_train, X_test, c=c)
        y_pred = (y_proba >= threshold).astype(int)
        f1 = f1_score(y_test, y_pred)
        auc = roc_auc_score(y_test, y_proba)
        print(f"  C={c}: F1 = {f1:.3f}, ROC AUC = {auc:.3f}")
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


if __name__ == "__main__":
    df = load_training_data()
    print(f"Loaded {len(df)} events")

    df = prepare_features(df)
    X_train, X_test, y_train, y_test = time_based_split(df)

    print(f"Train: {len(X_train)} events")
    print(f"Test:  {len(X_test)} events")

    # Random Forest
    rf_model, rf_proba = train_random_forest(X_train, y_train, X_test)
    best_rf_threshold = find_best_threshold(y_test, rf_proba)
    evaluate_model("Random Forest", y_test, rf_proba, best_rf_threshold)

    # Logistic Regression
    best_c = sweep_logistic_regularization(X_train, y_train, X_test, y_test)
    log_model, log_proba = train_logistic_model(X_train, y_train, X_test, c=best_c)
    best_log_threshold = find_best_threshold(y_test, log_proba)
    evaluate_model("Logistic Regression", y_test, log_proba, best_log_threshold)

    show_feature_importance(rf_model, X_train)
    show_logistic_coefficients(log_model, X_train)

    print("\nRandom Forest probability buckets:")
    show_probability_buckets(y_test, rf_proba)

    print("\nLogistic Regression probability buckets:")
    show_probability_buckets(y_test, log_proba)
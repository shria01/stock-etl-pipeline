import pandas as pd
from ml.predict_recovery import prepare_features, time_based_split



def make_fake_drop_events(n=20):
    quarters = pd.date_range("2018-01-01", periods=n, freq="QS")
    sectors = ["Technology", "Energy", "Health Care"] * (n // 3 + 1)

    df = pd.DataFrame({
        "ticker": [f"TICK{i}" for i in range(n)],
        "drop_quarter": quarters,
        "sector": sectors[:n],
        "drop_pct": [-0.20 - (i * 0.01) for i in range(n)],
        "max_drawdown_pct": [-0.25 - (i * 0.01) for i in range(n)],
        "volatility_90d": [0.02 + (i * 0.001) for i in range(n)],
        "prior_90d_return": [0.01 * i for i in range(n)],
        "volume_change_pct": [0.1 * i for i in range(n)],
        "distance_from_52w_high": [-0.3 - (i * 0.01) for i in range(n)],
        "fast_recovery": [i % 2 for i in range(n)],
    })
    df.loc[0, "prior_90d_return"] = None
    return df


def test_prepare_features_adds_missing_indicators():
    df = make_fake_drop_events()
    result = prepare_features(df)
    assert "prior_90d_return_missing" in result.columns
    assert result.loc[0, "prior_90d_return_missing"] == 1


def test_prepare_features_one_hot_encodes_sector():
    df = make_fake_drop_events()
    result = prepare_features(df)
    assert "sector" not in result.columns
    assert "sector_Technology" in result.columns


def test_time_based_split_no_look_ahead_bias():
    df = make_fake_drop_events(n=20)
    df = prepare_features(df)

    X_train, X_test, y_train, y_test = time_based_split(df)

    train_quarters = df.loc[X_train.index, "drop_quarter"]
    test_quarters = df.loc[X_test.index, "drop_quarter"]

    assert train_quarters.max() < test_quarters.min()


def test_time_based_split_excludes_non_feature_columns():
    df = make_fake_drop_events(n=20)
    df = prepare_features(df)

    X_train, X_test, y_train, y_test = time_based_split(df)

    for excluded in ("ticker", "drop_quarter", "fast_recovery"):
        assert excluded not in X_train.columns
        assert excluded not in X_test.columns

import pandas as pd
from ml.experiment_v5 import FEATURE_SETS, candidate_grid
from ml.survival_model import (
    cumulative_recovery_predictions,
    expand_observed_hazard_rows,
)
from ml.predict_recovery import (
    final_holdout_split_raw,
    prepare_features,
    purged_walk_forward_folds,
    time_based_split_raw,
)



def make_fake_drop_events(n=20):
    quarters = pd.date_range("2018-01-01", periods=n, freq="QS")
    sectors = ["Technology", "Energy", "Health Care"] * (n // 3 + 1)

    df = pd.DataFrame({
        "ticker": [f"TICK{i}" for i in range(n)],
        "drop_quarter": quarters,
        "prediction_date": quarters + pd.offsets.QuarterEnd(0),
        "label_end_date": quarters + pd.offsets.QuarterEnd(0) + pd.Timedelta(days=180),
        "sector": sectors[:n],
        "drop_pct": [-0.20 - (i * 0.01) for i in range(n)],
        "event_max_drawdown_pct": [-0.25 - (i * 0.01) for i in range(n)],
        "drawdown_velocity_pct_per_day": [-0.003 - (i * 0.0001) for i in range(n)],
        "volatility_90d": [0.02 + (i * 0.001) for i in range(n)],
        "prior_90d_return": [0.01 * i for i in range(n)],
        "volume_change_pct": [0.1 * i for i in range(n)],
        "distance_from_52w_high": [-0.3 - (i * 0.01) for i in range(n)],
        "severity_x_volatility": [-0.005 - (i * 0.0001) for i in range(n)],
        "relative_drop_x_velocity": [0.0006 + (i * 0.00001) for i in range(n)],
        "prior_return_x_relative_drop": [-0.002 * i for i in range(n)],
        "sp500_volatility_90d": [0.01 + (i * 0.0001) for i in range(n)],
        "sp500_return_20d": [0.005 * (i % 5) for i in range(n)],
        "sp500_return_90d": [0.01 * (i % 4) for i in range(n)],
        "sp500_distance_from_52w_high": [-0.02 * (i % 5) for i in range(n)],
        "market_breadth_below_200d": [0.3 + (i * 0.005) for i in range(n)],
        "fast_recovery": [i % 2 for i in range(n)],
    })
    df.loc[0, "prior_90d_return"] = None
    return df


def test_prepare_features_adds_missing_indicators():
    df = make_fake_drop_events()
    result, _ = prepare_features(df)
    assert "prior_90d_return_missing" in result.columns
    assert result.loc[0, "prior_90d_return_missing"] == 1


def test_prepare_features_one_hot_encodes_sector():
    df = make_fake_drop_events()
    result, _ = prepare_features(df)
    assert "sector" not in result.columns
    assert "sector_Technology" in result.columns


def test_time_based_split_no_look_ahead_bias():
    df = make_fake_drop_events(n=20)
    train_df, _, test_df = time_based_split_raw(df)

    assert train_df["label_end_date"].max() < test_df["prediction_date"].min()


def test_time_based_split_purges_overlapping_label_horizons():
    df = make_fake_drop_events(n=40)
    train_df, val_df, test_df = time_based_split_raw(df)

    assert train_df["label_end_date"].max() < val_df["prediction_date"].min()
    assert val_df["label_end_date"].max() < test_df["prediction_date"].min()


def test_time_based_split_excludes_non_feature_columns():
    df = make_fake_drop_events(n=20)
    train_df, _, test_df = time_based_split_raw(df)
    train_df, medians = prepare_features(train_df)
    test_df, _ = prepare_features(test_df, medians=medians)

    feature_cols = [
        column for column in train_df.columns
        if column not in ("ticker", "drop_quarter", "prediction_date", "label_end_date", "fast_recovery")
    ]
    X_train = train_df[feature_cols]
    X_test = test_df.reindex(columns=train_df.columns, fill_value=0)[feature_cols]

    for excluded in ("ticker", "drop_quarter", "prediction_date", "label_end_date", "fast_recovery"):
        assert excluded not in X_train.columns
        assert excluded not in X_test.columns


def test_prepare_features_includes_drawdown_velocity():
    result, _ = prepare_features(make_fake_drop_events())

    assert "drawdown_velocity_pct_per_day" in result.columns
    assert "drawdown_velocity_pct_per_day_missing" in result.columns


def test_prepare_features_imputes_an_entirely_missing_feature():
    df = make_fake_drop_events()
    df["drawdown_velocity_pct_per_day"] = None

    result, medians = prepare_features(df)

    assert medians["drawdown_velocity_pct_per_day"] == 0
    assert result["drawdown_velocity_pct_per_day"].eq(0).all()
    assert result["drawdown_velocity_pct_per_day_missing"].eq(1).all()


def test_final_holdout_split_purges_development_label_overlap():
    development, holdout, holdout_start = final_holdout_split_raw(
        make_fake_drop_events(n=40)
    )

    assert development["label_end_date"].max() < holdout_start
    assert holdout["prediction_date"].min() >= holdout_start


def test_walk_forward_folds_have_purged_label_horizons():
    development, _, _ = final_holdout_split_raw(make_fake_drop_events(n=60))
    folds = purged_walk_forward_folds(development, n_splits=4)

    assert len(folds) == 4
    for train, validation in folds:
        assert train["label_end_date"].max() < validation["prediction_date"].min()


def test_v5_feature_sets_exclude_outcomes_and_dates():
    forbidden = {
        "recovered_date", "days_to_recovery", "fast_recovery",
        "prediction_date", "label_end_date", "recovery_path_max_drawdown_pct",
    }

    for features in FEATURE_SETS.values():
        assert forbidden.isdisjoint(features)


def test_v5_candidate_grid_compares_compact_and_shape_models():
    candidates = list(candidate_grid())

    assert {candidate["feature_set"] for candidate in candidates} == set(FEATURE_SETS)
    assert {candidate["penalty"] for candidate in candidates} == {"l2", "elastic_net"}


def test_survival_expansion_keeps_only_observed_censored_intervals():
    events = pd.DataFrame([{
        "event_id": 1,
        "ticker": "TEST",
        "prediction_date": pd.Timestamp("2020-01-01"),
        "recovered_date": pd.NaT,
        "latest_price_date": pd.Timestamp("2020-03-20"),
        "sector": "Technology",
    }])

    expanded = expand_observed_hazard_rows(events)

    assert expanded["hazard_bucket"].tolist() == ["1-30", "31-60"]
    assert expanded["recovered_in_bucket"].eq(0).all()


def test_survival_expansion_stops_at_recovery_bucket():
    events = pd.DataFrame([{
        "event_id": 1,
        "ticker": "TEST",
        "prediction_date": pd.Timestamp("2020-01-01"),
        "recovered_date": pd.Timestamp("2020-02-15"),
        "latest_price_date": pd.Timestamp("2021-01-01"),
        "sector": "Technology",
    }])

    expanded = expand_observed_hazard_rows(events)

    assert expanded["recovered_in_bucket"].tolist() == [0, 1]


def test_cumulative_recovery_probability_is_monotonic():
    scoring_rows = pd.DataFrame({
        "event_id": [1, 1, 1],
        "bucket_index": [0, 1, 2],
    })
    curve = cumulative_recovery_predictions(scoring_rows, [0.1, 0.2, 0.3])

    assert curve["recovery_probability"].is_monotonic_increasing

from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pandas as pd


def generate_weather_series(start_year: int = 2016, end_year: int = 2026, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    dates = pd.date_range(f"{start_year}-01-01", f"{end_year}-12-31", freq="D")
    day_of_year = dates.dayofyear.to_numpy()
    month = dates.month.to_numpy()

    aqi = 180 + 120 * np.cos(2 * np.pi * (day_of_year - 15) / 365) + rng.normal(0, 20, len(dates))
    rainfall = np.maximum(0, rng.normal(8, 12, len(dates)))
    rainfall += np.where(np.isin(month, [6, 7, 8, 9]), rng.normal(70, 25, len(dates)), 0)
    heat = 32 + 10 * np.sin(2 * np.pi * (day_of_year - 80) / 365) + rng.normal(0, 2.2, len(dates))

    return pd.DataFrame(
        {
            "date": dates,
            "aqi": np.clip(aqi, 30, 500),
            "rain_mm": np.clip(rainfall, 0, 240),
            "temp_max_c": np.clip(heat, 18, 50),
        }
    )


def generate_claim_training(rows: int = 5000, seed: int = 42) -> tuple[pd.DataFrame, np.ndarray]:
    rng = np.random.default_rng(seed)
    df = pd.DataFrame(
        {
            "forecast_rain_next_7d": rng.uniform(0, 200, rows),
            "historical_claim_freq_hex": rng.uniform(0.0, 1.0, rows),
            "past_week_avg_aqi": rng.uniform(0, 500, rows),
            "season_sin": rng.uniform(-1, 1, rows),
            "season_cos": rng.uniform(-1, 1, rows),
            "worker_density_hex": rng.uniform(0, 1, rows),
            "urban_tier": rng.integers(1, 5, rows),
        }
    )
    y = (
        0.018 * df["forecast_rain_next_7d"]
        + 3.5 * df["historical_claim_freq_hex"]
        + 0.004 * df["past_week_avg_aqi"]
        - 1.2 * df["season_cos"]
        - 0.8 * df["season_sin"]
        + 1.6 * df["worker_density_hex"]
        + 0.4 * df["urban_tier"]
        + rng.normal(0, 0.4, rows)
    )
    y = np.clip(y - np.mean(y), -5, 5)
    return df, y.to_numpy()


def last_n_weeks(n: int) -> list[date]:
    start = date.today() - timedelta(weeks=n)
    return [start + timedelta(weeks=i) for i in range(n)]


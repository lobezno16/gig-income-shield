from datetime import date
from math import cos, pi, sin
from random import Random


FEATURE_NAMES = [
    "forecast_rain_next_7d",
    "historical_claim_freq_hex",
    "past_week_avg_aqi",
    "season_sin",
    "season_cos",
    "worker_density_hex",
    "urban_tier",
]


def build_features(
    *,
    h3_hex: str,
    urban_tier: int,
    historical_claim_freq_hex: float,
    past_week_avg_aqi: float,
    forecast_rain_next_7d: float,
    worker_density_hex: float,
    week_of_year: int | None = None,
) -> dict[str, float]:
    week = week_of_year if week_of_year is not None else date.today().isocalendar()[1]
    season_sin = sin(2 * pi * week / 52)
    season_cos = cos(2 * pi * week / 52)

    return {
        "forecast_rain_next_7d": float(forecast_rain_next_7d),
        "historical_claim_freq_hex": float(historical_claim_freq_hex),
        "past_week_avg_aqi": float(past_week_avg_aqi),
        "season_sin": float(season_sin),
        "season_cos": float(season_cos),
        "worker_density_hex": float(worker_density_hex),
        "urban_tier": float(urban_tier),
    }


def deterministic_feature_seed(h3_hex: str) -> dict[str, float]:
    rng = Random(h3_hex)
    return build_features(
        h3_hex=h3_hex,
        urban_tier=int(rng.choice([1, 1, 1, 2, 3, 4])),
        historical_claim_freq_hex=round(rng.uniform(0.05, 0.45), 4),
        past_week_avg_aqi=round(rng.uniform(80, 430), 2),
        forecast_rain_next_7d=round(rng.uniform(0, 200), 2),
        worker_density_hex=round(rng.uniform(0.1, 1.0), 4),
    )


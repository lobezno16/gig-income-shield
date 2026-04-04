from __future__ import annotations

from dataclasses import dataclass

import numpy as np


SCENARIOS = {
    "14_day_monsoon": {
        "perils": ["rain", "flood"],
        "duration_days": 14,
        "cities": ["mumbai", "chennai", "kolkata"],
        "rain_distribution": "normal",
        "rain_mean_mm": 120,
        "rain_std_mm": 25,
        "worker_density_range": (0.8, 1.2),
        "cross_city_correlation": 0.6,
        "simulations": 10000,
    },
    "diwali_aqi": {
        "perils": ["aqi"],
        "duration_days": 21,
        "cities": ["delhi"],
        "aqi_mean": 430,
        "aqi_std": 40,
        "simulations": 10000,
    },
    "summer_multiperil": {
        "perils": ["heat", "aqi"],
        "duration_days": 7,
        "cities": ["delhi", "jaipur", "nagpur"],
        "temp_mean": 46,
        "aqi_mean": 310,
        "simulations": 10000,
    },
    "flash_strike_wave": {
        "perils": ["curfew", "store"],
        "duration_days": 1,
        "cities": ["delhi", "mumbai", "bangalore"],
        "simultaneous": True,
        "simulations": 10000,
    },
}


@dataclass
class StressOutput:
    workers_exposed: int
    mean_liability: float
    ci_low: float
    ci_high: float
    pool_reserves: float
    pool_adequacy: float
    mean_bcr: float
    reserve_buffer: float
    underfunded: bool


def run_stress_scenario(scenario_name: str, seed: int = 42) -> StressOutput:
    cfg = SCENARIOS[scenario_name]
    rng = np.random.default_rng(seed + abs(hash(scenario_name)) % 1000)
    sims = int(cfg["simulations"])

    worker_base = 4200 * len(cfg["cities"])
    worker_density_factor = rng.uniform(0.8, 1.2, sims)
    workers_exposed = int(np.mean(worker_base * worker_density_factor))

    if scenario_name == "14_day_monsoon":
        severity = rng.normal(cfg["rain_mean_mm"], cfg["rain_std_mm"], sims)
        loss_rate = 0.45 + (severity - cfg["rain_mean_mm"]) / 400
    elif scenario_name == "diwali_aqi":
        severity = rng.normal(cfg["aqi_mean"], cfg["aqi_std"], sims)
        loss_rate = 0.42 + (severity - cfg["aqi_mean"]) / 500
    elif scenario_name == "summer_multiperil":
        severity = rng.normal(cfg["temp_mean"], 2.5, sims) + rng.normal(cfg["aqi_mean"], 30, sims) / 100
        loss_rate = 0.4 + (severity - np.mean(severity)) / 300
    else:
        severity = rng.normal(0.7, 0.15, sims)
        loss_rate = 0.5 + (severity - np.mean(severity)) / 4

    loss_rate = np.clip(loss_rate, 0.12, 0.95)
    per_worker_payout = rng.normal(650, 140, sims)
    liabilities = workers_exposed * loss_rate * per_worker_payout / 100

    mean_liability = float(np.mean(liabilities))
    ci_low, ci_high = np.percentile(liabilities, [5, 95]).tolist()
    pool_reserves = float(max(5_200_000, np.mean(liabilities) * 0.63))
    adequacy = pool_reserves / mean_liability if mean_liability else 1.0
    mean_bcr = float(np.mean(liabilities) / max(1_000_000, np.mean(liabilities) * 0.72))
    reserve_buffer = float(max(0.0, mean_liability - pool_reserves))
    underfunded = adequacy < 1.0

    return StressOutput(
        workers_exposed=workers_exposed,
        mean_liability=mean_liability,
        ci_low=float(ci_low),
        ci_high=float(ci_high),
        pool_reserves=pool_reserves,
        pool_adequacy=adequacy,
        mean_bcr=mean_bcr,
        reserve_buffer=reserve_buffer,
        underfunded=underfunded,
    )


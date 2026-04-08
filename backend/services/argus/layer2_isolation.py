from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import IsolationForest


@dataclass
class IsolationFeatures:
    claim_freq_30d: float
    avg_payout: float
    gps_variance: float
    login_duration_min: float
    days_since_reg: float
    neighbor_claim_ratio: float


ISOLATION_FEATURE_ORDER = [
    "claim_freq_30d",
    "avg_payout",
    "gps_variance",
    "login_duration_min",
    "days_since_reg",
    "neighbor_claim_ratio",
]


class IsolationLayer:
    def __init__(self) -> None:
        artifact_path = Path(__file__).resolve().parents[2] / "ml" / "models" / "argus_isolation.pkl"
        if artifact_path.exists():
            artifact = joblib.load(artifact_path)
            self.model: IsolationForest = artifact["model"]
            return

        rng = np.random.default_rng(42)
        fallback_data = np.column_stack(
            [
                rng.uniform(0, 6, 2000),
                rng.uniform(100, 900, 2000),
                rng.uniform(4, 40, 2000),
                rng.uniform(30, 600, 2000),
                rng.uniform(20, 600, 2000),
                rng.uniform(0.0, 0.4, 2000),
            ]
        )
        self.model = IsolationForest(contamination=0.05, n_estimators=100, random_state=42)
        self.model.fit(fallback_data)

    def score(self, features: IsolationFeatures) -> float:
        values = {
            "claim_freq_30d": features.claim_freq_30d,
            "avg_payout": features.avg_payout,
            "gps_variance": features.gps_variance,
            "login_duration_min": features.login_duration_min,
            "days_since_reg": features.days_since_reg,
            "neighbor_claim_ratio": features.neighbor_claim_ratio,
        }
        row = np.array([[float(values[name]) for name in ISOLATION_FEATURE_ORDER]])
        raw = self.model.decision_function(row)[0]
        normalized = 1 - (raw + 0.5)
        return max(0.0, min(1.0, float(normalized)))

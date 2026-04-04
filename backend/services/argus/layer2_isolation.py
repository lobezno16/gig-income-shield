from __future__ import annotations

from dataclasses import dataclass

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


class IsolationLayer:
    def __init__(self) -> None:
        rng = np.random.default_rng(42)
        normal = np.column_stack(
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
        self.model.fit(normal)

    def score(self, features: IsolationFeatures) -> float:
        row = np.array(
            [
                [
                    features.claim_freq_30d,
                    features.avg_payout,
                    features.gps_variance,
                    features.login_duration_min,
                    features.days_since_reg,
                    features.neighbor_claim_ratio,
                ]
            ]
        )
        raw = self.model.decision_function(row)[0]
        normalized = 1 - (raw + 0.5)
        return max(0.0, min(1.0, float(normalized)))


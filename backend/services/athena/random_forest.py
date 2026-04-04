from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor

from config import get_settings
from services.athena.feature_engineer import FEATURE_NAMES

try:
    import shap
except Exception:  # pragma: no cover
    shap = None


@dataclass
class ModelArtifacts:
    model: RandomForestRegressor
    feature_names: list[str]
    base_value: float


class RandomForestPremiumModel:
    def __init__(self, model_path: Path | None = None) -> None:
        settings = get_settings()
        self.model_path = model_path or settings.model_dir_path / "premium_rf.pkl"
        self._artifacts: ModelArtifacts | None = None

    def load_or_train_default(self) -> ModelArtifacts:
        if self._artifacts:
            return self._artifacts

        if self.model_path.exists():
            payload: dict[str, Any] = joblib.load(self.model_path)
            self._artifacts = ModelArtifacts(
                model=payload["model"],
                feature_names=payload["feature_names"],
                base_value=float(payload.get("base_value", 0.0)),
            )
            return self._artifacts

        self.model_path.parent.mkdir(parents=True, exist_ok=True)
        X, y = self._generate_synthetic_training_data(5000)
        model = RandomForestRegressor(
            n_estimators=200,
            max_depth=8,
            min_samples_leaf=20,
            random_state=42,
        )
        model.fit(X, y)
        base_value = float(np.mean(y))
        payload = {"model": model, "feature_names": FEATURE_NAMES, "base_value": base_value}
        joblib.dump(payload, self.model_path)
        self._artifacts = ModelArtifacts(model=model, feature_names=FEATURE_NAMES, base_value=base_value)
        return self._artifacts

    def predict_adjustment(self, features: dict[str, float]) -> tuple[float, dict[str, float], float]:
        artifacts = self.load_or_train_default()
        ordered = np.array([[features[name] for name in artifacts.feature_names]])
        raw_adjustment = float(artifacts.model.predict(ordered)[0])
        clamped = float(np.clip(raw_adjustment, -5.0, 5.0))
        shap_values = self._compute_shap_like_values(artifacts, features)
        return clamped, shap_values, artifacts.base_value

    def _compute_shap_like_values(self, artifacts: ModelArtifacts, features: dict[str, float]) -> dict[str, float]:
        if shap is not None:
            try:
                explainer = shap.TreeExplainer(artifacts.model)
                ordered = np.array([[features[name] for name in artifacts.feature_names]])
                values = explainer.shap_values(ordered)[0]
                return {name: round(float(val), 3) for name, val in zip(artifacts.feature_names, values)}
            except Exception:
                pass

        # Fallback: derive directional contributions using feature importances.
        importances = artifacts.model.feature_importances_
        contributions = {}
        for idx, name in enumerate(artifacts.feature_names):
            baseline = 0.5 if name in {"historical_claim_freq_hex", "worker_density_hex"} else 1.0
            if name == "urban_tier":
                baseline = 2.0
            diff = float(features[name] - baseline)
            contributions[name] = round(float(diff * importances[idx] * 4.0), 3)

        contributions["season"] = round(contributions.get("season_sin", 0.0) + contributions.get("season_cos", 0.0), 3)
        return contributions

    def _generate_synthetic_training_data(self, rows: int) -> tuple[pd.DataFrame, np.ndarray]:
        rng = np.random.default_rng(42)
        X = pd.DataFrame(
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
        noise = rng.normal(0, 0.4, rows)
        y = (
            0.018 * X["forecast_rain_next_7d"]
            + 3.5 * X["historical_claim_freq_hex"]
            + 0.004 * X["past_week_avg_aqi"]
            - 1.2 * X["season_cos"]
            - 0.8 * X["season_sin"]
            + 1.6 * X["worker_density_hex"]
            + 0.4 * X["urban_tier"]
            + noise
        )
        y = np.clip(y - np.mean(y), -5.0, 5.0)
        return X, y


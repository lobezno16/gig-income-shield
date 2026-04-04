from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import IsolationForest, RandomForestRegressor

from ml.synthetic_data import generate_claim_training


def train_models(model_dir: str = "./ml/models") -> dict:
    out = Path(model_dir)
    out.mkdir(parents=True, exist_ok=True)

    X, y = generate_claim_training(rows=6000, seed=42)
    rf = RandomForestRegressor(
        n_estimators=200,
        max_depth=8,
        min_samples_leaf=20,
        random_state=42,
    )
    rf.fit(X, y)
    rf_path = out / "premium_rf.pkl"
    joblib.dump({"model": rf, "feature_names": list(X.columns), "base_value": float(np.mean(y))}, rf_path)

    if_data = np.column_stack(
        [
            np.random.uniform(0, 6, 3000),
            np.random.uniform(100, 900, 3000),
            np.random.uniform(4, 40, 3000),
            np.random.uniform(30, 600, 3000),
            np.random.uniform(20, 600, 3000),
            np.random.uniform(0.0, 0.4, 3000),
        ]
    )
    iso = IsolationForest(contamination=0.05, n_estimators=100, random_state=42)
    iso.fit(if_data)
    iso_path = out / "argus_isolation.pkl"
    joblib.dump({"model": iso}, iso_path)

    return {"rf_model": str(rf_path), "isolation_model": str(iso_path)}


if __name__ == "__main__":
    artifacts = train_models()
    print(f"Trained models: {artifacts}")


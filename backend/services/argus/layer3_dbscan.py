from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from sklearn.cluster import DBSCAN
from sklearn.metrics.pairwise import cosine_similarity


@dataclass
class RingContext:
    worker_vector: list[float]
    neighborhood_vectors: list[list[float]]
    worker_claim_rate: float
    hex_mean_rate: float
    hex_std_rate: float


def layer3_dbscan_and_zscore(context: RingContext) -> tuple[float, int, float]:
    matrix = np.array([context.worker_vector] + context.neighborhood_vectors)
    similarity = cosine_similarity(matrix)
    clustering = DBSCAN(eps=0.02, min_samples=3, metric="cosine").fit(similarity)
    ring_flag = 1 if clustering.labels_[0] != -1 else 0
    std = max(context.hex_std_rate, 1e-6)
    z_score = (context.worker_claim_rate - context.hex_mean_rate) / std
    z_score_normalized = float(max(0.0, min(1.0, (z_score + 3) / 6)))
    return z_score_normalized, ring_flag, z_score


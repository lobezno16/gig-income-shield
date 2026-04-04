import types

import pytest

from models.worker import Platform, WorkerTier
from services.athena import bayesian_updater
from services.athena.premium_engine import AthenaPremiumEngine, PlanType


class DummyWorker:
    def __init__(self):
        self.platform = Platform.zepto
        self.city = "delhi"
        self.tier = WorkerTier.silver
        self.h3_hex = "872a1072bffffff"


class DummyDB:
    pass


@pytest.mark.asyncio
async def test_premium_clamps_to_plan_range(monkeypatch):
    async def fake_prob(self, hex_id: str, peril: str) -> float:
        _ = (self, hex_id, peril)
        return 0.95

    monkeypatch.setattr(bayesian_updater.BayesianBetaBinomial, "get_trigger_probability", fake_prob)
    engine = AthenaPremiumEngine(DummyDB())
    worker = DummyWorker()
    result = await engine.calculate_premium(worker, PlanType.pro, "delhi_aqi_pool", 1)
    assert 40 <= result.final_premium <= 50


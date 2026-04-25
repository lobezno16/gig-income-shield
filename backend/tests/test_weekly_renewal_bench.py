import asyncio
import time
import pytest
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import selectinload

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.selectable import Select

from models.policy import Policy, PolicyStatus, PlanType
from models.worker import Worker, Platform, WorkerTier
from models.premium import BayesianPosterior, H3RiskProfile
from services.renewal.weekly_renewal import run_weekly_renewal
from services.athena import bayesian_updater
from services.athena.premium_engine import AthenaPremiumEngine

class DummyWorker:
    def __init__(self, _id):
        self.id = _id
        self.platform = Platform.zepto
        self.city = "delhi"
        self.tier = WorkerTier.silver
        self.h3_hex = f"hex_{_id}"
        self.active_days_30 = 10

class DummyPolicy:
    def __init__(self, _id):
        self.id = _id
        self.worker = DummyWorker(_id)
        self.status = PolicyStatus.active
        self.expires_at = datetime.now(timezone.utc) + timedelta(days=1)
        self.plan = PlanType.pro
        self.pool_id = "delhi_aqi_pool"
        self.urban_tier = 1
        self.weekly_premium = 0.0

class DummyRiskProfile:
    def __init__(self, _id):
        self.h3_hex = f"hex_{_id}"
        self.peril = "aqi"
        self.trigger_prob_p50 = 0.15

class DummyPosterior:
    def __init__(self, _id):
        self.h3_hex = f"hex_{_id}"
        self.peril = "aqi"
        self.trigger_prob = 0.20

class DummyResult:
    def __init__(self, scalars):
        self._scalars = scalars
    def scalars(self):
        return self
    def all(self):
        return self._scalars

class DummyDB:
    async def execute(self, stmt):
        # determine which model is being queried
        str_stmt = str(stmt).lower()
        if "h3_risk_profiles" in str_stmt:
            return DummyResult([DummyRiskProfile(i) for i in range(100)])
        elif "bayesian_posteriors" in str_stmt:
            return DummyResult([DummyPosterior(i) for i in range(100)])
        else:
            return DummyResult([DummyPolicy(i) for i in range(100)])

    def add(self, record):
        pass

    async def commit(self):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass

@pytest.mark.asyncio
async def test_weekly_renewal_benchmark(monkeypatch):
    monkeypatch.setattr("services.renewal.weekly_renewal.AsyncSessionLocal", DummyDB)

    # We want to measure how long run_weekly_renewal takes
    start_time = time.time()
    await run_weekly_renewal()
    end_time = time.time()

    print(f"\\nTime taken for 100 policies: {end_time - start_time:.4f} seconds")

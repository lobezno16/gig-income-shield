from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import BayesianPosterior, H3RiskProfile


@dataclass
class BayesianResult:
    alpha: float
    beta: float
    probability: float


class BayesianBetaBinomial:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def update(self, hex_id: str, peril: str, trigger_occurred: bool) -> float:
        record = await self._get_or_init_record(hex_id, peril)
        if trigger_occurred:
            record.alpha = float(record.alpha) + 1
        else:
            record.beta_param = float(record.beta_param) + 1

        record.trigger_prob = float(record.alpha) / (float(record.alpha) + float(record.beta_param))
        record.last_updated = datetime.now(timezone.utc)
        await self.db.commit()
        return float(record.trigger_prob)

    async def get_trigger_probability(self, hex_id: str, peril: str) -> float:
        stmt = select(BayesianPosterior).where(BayesianPosterior.h3_hex == hex_id, BayesianPosterior.peril == peril)
        result = await self.db.execute(stmt)
        record = result.scalar_one_or_none()
        if record:
            return float(record.trigger_prob)

        risk_stmt = select(H3RiskProfile).where(H3RiskProfile.h3_hex == hex_id, H3RiskProfile.peril == peril)
        risk_result = await self.db.execute(risk_stmt)
        risk = risk_result.scalar_one_or_none()
        if risk and risk.trigger_prob_p50 is not None:
            return float(risk.trigger_prob_p50)
        return 0.12

    async def _get_or_init_record(self, hex_id: str, peril: str) -> BayesianPosterior:
        stmt = select(BayesianPosterior).where(BayesianPosterior.h3_hex == hex_id, BayesianPosterior.peril == peril)
        result = await self.db.execute(stmt)
        record = result.scalar_one_or_none()
        if record:
            return record

        risk_stmt = select(H3RiskProfile).where(H3RiskProfile.h3_hex == hex_id, H3RiskProfile.peril == peril)
        risk_result = await self.db.execute(risk_stmt)
        risk = risk_result.scalar_one_or_none()
        prior_prob = float(risk.trigger_prob_p50) if risk and risk.trigger_prob_p50 is not None else 0.12
        # Use a soft prior weight of 52 weeks.
        alpha = prior_prob * 52 + 1
        beta = (1 - prior_prob) * 52 + 1

        record = BayesianPosterior(
            h3_hex=hex_id,
            peril=peril,
            alpha=alpha,
            beta_param=beta,
            trigger_prob=alpha / (alpha + beta),
        )
        self.db.add(record)
        await self.db.commit()
        await self.db.refresh(record)
        return record


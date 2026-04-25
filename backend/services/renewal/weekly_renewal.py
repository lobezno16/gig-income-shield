from __future__ import annotations

from datetime import datetime, timedelta, timezone

import structlog
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from database import AsyncSessionLocal
from models import Policy, PolicyStatus, PremiumRecord
from services.athena.premium_engine import AthenaPremiumEngine, POOL_PRIMARY_PERIL
from services.athena.bayesian_updater import BayesianBetaBinomial

logger = structlog.get_logger("renewal")


def _as_aware_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


async def run_weekly_renewal() -> None:
    """
    Runs every Sunday at 23:00 IST (17:30 UTC).
    Renews active policies, recalculates premium, and extends expiry by 7 days.
    Lapses policies past expiry + 3 day grace.
    """
    logger.info("weekly_renewal_started")
    async with AsyncSessionLocal() as db:
        now = datetime.now(timezone.utc)
        renewal_threshold = now + timedelta(days=3)
        active_policies = (
            await db.execute(
                select(Policy)
                .options(selectinload(Policy.worker))
                .where(Policy.status == PolicyStatus.active)
            )
        ).scalars().all()

        renewed = 0
        lapsed = 0
        skipped = 0

        # Pre-fetch probabilities
        hex_peril_pairs = set()
        for policy in active_policies:
            worker = policy.worker
            if worker is not None:
                primary_peril = POOL_PRIMARY_PERIL.get(policy.pool_id, "rain")
                hex_peril_pairs.add((worker.h3_hex, primary_peril))

        bayes = BayesianBetaBinomial(db)
        prob_cache = await bayes.get_bulk_trigger_probabilities(list(hex_peril_pairs))

        engine = AthenaPremiumEngine(db)
        for policy in active_policies:
            worker = policy.worker
            if worker is None:
                logger.warning("weekly_renewal_worker_missing", policy_id=str(policy.id))
                continue

            expires_at = _as_aware_utc(policy.expires_at)

            # Idempotency guard: if already renewed beyond next-3-days window, skip.
            if expires_at and expires_at > renewal_threshold:
                skipped += 1
                logger.info(
                    "weekly_renewal_skipped_already_renewed",
                    policy_id=str(policy.id),
                    worker_id=str(worker.id),
                    expires_at=expires_at.isoformat(),
                )
                continue

            grace_deadline = expires_at + timedelta(days=3) if expires_at else None
            if grace_deadline and now > grace_deadline:
                policy.status = PolicyStatus.lapsed
                lapsed += 1
                logger.info(
                    "policy_lapsed",
                    policy_id=str(policy.id),
                    worker_id=str(worker.id),
                    expires_at=expires_at.isoformat() if expires_at else None,
                    grace_deadline=grace_deadline.isoformat(),
                )
                continue

            try:
                result = await engine.calculate_premium(worker, policy.plan, policy.pool_id, policy.urban_tier, prob_cache=prob_cache)
                base_expiry = expires_at if expires_at and expires_at > now else now
                policy.weekly_premium = result.final_premium
                policy.expires_at = base_expiry + timedelta(days=7)
                policy.warranty_met = worker.active_days_30 >= 7

                record = PremiumRecord(
                    worker_id=worker.id,
                    policy_id=policy.id,
                    week_start=now.date(),
                    base_formula=result.base_cost,
                    ml_adjustment=result.ml_adjustment,
                    final_premium=result.final_premium,
                    shap_values=result.shap_values,
                    bayesian_probs={result.peril: result.trigger_probability},
                    features=result.features,
                )
                db.add(record)
                renewed += 1
                logger.info(
                    "policy_renewed",
                    policy_id=str(policy.id),
                    worker_id=str(worker.id),
                    new_expires_at=policy.expires_at.isoformat() if policy.expires_at else None,
                    weekly_premium=float(policy.weekly_premium),
                )
            except Exception as exc:
                logger.exception("renewal_failed", policy_id=str(policy.id), worker_id=str(worker.id), error=str(exc))

        await db.commit()
        logger.info("weekly_renewal_completed", renewed=renewed, lapsed=lapsed, skipped=skipped)

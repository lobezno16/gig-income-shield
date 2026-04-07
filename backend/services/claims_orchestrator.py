from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from events import event_bus
from models import Claim, ClaimStatus, Policy, PolicyStatus
from services.argus.fraud_pipeline import ArgusFraudPipeline
from services.argus.layer0_rules import Layer0ClaimData
from services.hermes.settlement import process_settlement
from services.id_gen import generate_claim_number


async def get_latest_active_policy(db: AsyncSession, worker_id) -> Policy | None:
    stmt = select(Policy).where(Policy.worker_id == worker_id).order_by(desc(Policy.created_at))
    policy = (await db.execute(stmt)).scalars().first()
    if not policy:
        return None
    if policy.status != PolicyStatus.active:
        return None
    return policy


async def orchestrate_claim_for_worker(
    db: AsyncSession,
    *,
    worker,
    trigger,
    gps_lat: float,
    gps_lng: float,
    platform_active_at_trigger: bool = True,
    timestamp: datetime | None = None,
    typical_shift_start: int = 8,
    typical_shift_end: int = 23,
) -> tuple[Claim | None, dict]:
    policy = await get_latest_active_policy(db, worker.id)
    if not policy:
        return None, {"reason": "no_active_policy"}

    argus = ArgusFraudPipeline()
    fraud = await argus.evaluate(
        db,
        worker,
        trigger,
        Layer0ClaimData(
            gps_lat=gps_lat,
            gps_lng=gps_lng,
            platform_active_at_trigger=platform_active_at_trigger,
            timestamp=timestamp or datetime.now(timezone.utc),
            typical_shift_start=typical_shift_start,
            typical_shift_end=typical_shift_end,
        ),
    )

    claim = Claim(
        claim_number=generate_claim_number(),
        worker_id=worker.id,
        policy_id=policy.id,
        trigger_id=trigger.id,
        status=ClaimStatus(fraud.status),
        payout_amount=0,
        payout_pct=trigger.payout_pct,
        fraud_score=fraud.combined_score,
        fraud_flags=fraud.fraud_flags,
        argus_layers=fraud.layers,
    )
    db.add(claim)
    await db.commit()
    await db.refresh(claim)

    await event_bus.publish(
        "claims",
        "new_claim",
        {
            "id": str(claim.id),
            "claim_number": claim.claim_number,
            "worker_id": str(claim.worker_id),
            "worker_name": worker.name,
            "status": claim.status.value,
            "argus_score": float(claim.fraud_score or 0),
        },
    )

    settlement = await process_settlement(claim, worker, trigger, policy, db)
    await db.refresh(claim)
    return claim, {
        "settlement_status": settlement.status,
        "attempts": settlement.attempts,
        "message": settlement.message,
        "payout_amount": float(claim.payout_amount),
    }


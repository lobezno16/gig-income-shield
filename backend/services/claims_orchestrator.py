from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Mapping
from uuid import UUID

import structlog
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from events import event_bus
from models import Claim, ClaimStatus, Policy, PolicyStatus
from services.argus.fraud_pipeline import ArgusFraudPipeline
from services.argus.layer0_rules import Layer0ClaimData
from services.hermes.settlement import _settle_claim_background
from services.id_gen import generate_claim_number

logger = structlog.get_logger("soteria.claims_orchestrator")


def _as_aware_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


async def get_latest_active_policy(db: AsyncSession, worker_id: UUID) -> Policy | None:
    stmt = select(Policy).where(Policy.worker_id == worker_id).order_by(desc(Policy.created_at))
    policy = (await db.execute(stmt)).scalars().first()
    if not policy:
        return None
    if policy.status != PolicyStatus.active:
        return None

    if policy.expires_at and _as_aware_utc(policy.expires_at) < datetime.now(timezone.utc):
        policy.status = PolicyStatus.lapsed
        await db.commit()
        logger.info("policy_auto_lapsed", policy_id=str(policy.id), worker_id=str(worker_id))
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
    device_telemetry: Mapping[str, Any] | None = None,
    recent_h3_pings: list[Mapping[str, Any]] | None = None,
    oracle_snapshot: Mapping[str, Any] | None = None,
) -> tuple[Claim | None, dict]:
    policy = await get_latest_active_policy(db, worker.id)
    if not policy:
        return None, {"reason": "no_active_policy"}
    expires_at = policy.expires_at
    if expires_at:
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            return None, {"reason": "policy_expired"}
    if policy.status != PolicyStatus.active:
        return None, {"reason": "policy_not_active"}

    argus = ArgusFraudPipeline()
    claim_number = generate_claim_number()
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
            device_telemetry=device_telemetry,
            recent_h3_pings=recent_h3_pings or [],
            oracle_snapshot=oracle_snapshot,
        ),
        claim_number=claim_number,
    )

    claim = Claim(
        claim_number=claim_number,
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

    try:
        # Lazy import avoids module import cycle:
        # trigger_cron -> claims_orchestrator -> trigger_monitor -> trigger_cron
        from services.sentinelle.trigger_monitor import trigger_monitor

        if not trigger_monitor.started:
            logger.warning("trigger_monitor_not_started_auto_starting")
            trigger_monitor.start()
        trigger_monitor.scheduler.add_job(
            _settle_claim_background,
            trigger="date",
            args=[str(claim.id)],
            id=f"settle_{claim.id}",
            misfire_grace_time=60,
            replace_existing=True,
        )
    except Exception:
        logger.exception("settlement_queue_failed", claim_id=str(claim.id), worker_id=str(worker.id))
        return claim, {
            "settlement_status": "processing",
            "attempts": 0,
            "message": "Settlement queue failed; claim remains in processing state.",
            "payout_amount": 0.0,
        }

    return claim, {
        "settlement_status": "processing",
        "attempts": 0,
        "message": "Settlement queued. Payout will be processed within 60 seconds.",
        "payout_amount": 0.0,
    }


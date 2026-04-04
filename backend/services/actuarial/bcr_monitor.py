from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from events import event_bus
from models import BCRRecord, Claim, Policy
from services.actuarial.pool_manager import set_pool_suspension

BCR_THRESHOLDS = {
    "healthy": (0.0, 0.70),
    "warning": (0.70, 0.85),
    "critical": (0.85, 1.00),
    "catastrophic": (1.00, float("inf")),
}


def _status_for_bcr(value: float) -> str:
    for status, (lower, upper) in BCR_THRESHOLDS.items():
        if lower <= value < upper:
            return status
    return "catastrophic"


async def update_bcr(pool_id: str, db: AsyncSession) -> BCRRecord:
    settings = get_settings()
    period_end = date.today()
    period_start = period_end - timedelta(days=30)

    premium_stmt = (
        select(func.coalesce(func.sum(Policy.weekly_premium), 0))
        .where(Policy.pool_id == pool_id)
        .where(Policy.created_at >= period_start)
    )
    premium_total = float((await db.execute(premium_stmt)).scalar_one())

    claims_stmt = (
        select(func.coalesce(func.sum(Claim.payout_amount), 0))
        .join(Policy, Policy.id == Claim.policy_id)
        .where(Policy.pool_id == pool_id)
        .where(Claim.created_at >= period_start)
    )
    claims_total = float((await db.execute(claims_stmt)).scalar_one())

    premium_base = premium_total if premium_total > 0 else 1
    bcr = claims_total / premium_base
    status = _status_for_bcr(bcr)

    if bcr > settings.bcr_suspend_threshold:
        await set_pool_suspension(db, pool_id, True, "BCR exceeded suspend threshold")
    elif bcr < settings.bcr_warning_threshold:
        await set_pool_suspension(db, pool_id, False, None)

    if bcr > settings.bcr_warning_threshold:
        await event_bus.publish(
            "claims",
            "bcr_alert",
            {"pool_id": pool_id, "bcr": round(bcr, 4), "status": status},
        )

    record = BCRRecord(
        pool_id=pool_id,
        period_start=period_start,
        period_end=period_end,
        total_premiums=premium_total,
        total_claims=claims_total,
        bcr=bcr,
        status=status,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

import h3
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Claim


@dataclass
class Layer0ClaimData:
    gps_lat: float
    gps_lng: float
    platform_active_at_trigger: bool
    timestamp: datetime
    typical_shift_start: int
    typical_shift_end: int


def is_within_shift_hours(ts: datetime, shift_start: int, shift_end: int) -> bool:
    hour = ts.hour
    if shift_start <= shift_end:
        return shift_start <= hour <= shift_end
    return hour >= shift_start or hour <= shift_end


async def duplicate_claim_exists(db: AsyncSession, worker_id: str, trigger_id: str) -> bool:
    stmt = select(Claim.id).where(Claim.worker_id == worker_id, Claim.trigger_id == trigger_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none() is not None


async def layer0_rules(db: AsyncSession, worker, trigger, claim_data: Layer0ClaimData) -> tuple[bool, list[str], dict[str, bool]]:
    checks = {
        "gps_in_zone": h3.latlng_to_cell(claim_data.gps_lat, claim_data.gps_lng, 7) == trigger.h3_hex,
        "was_active": claim_data.platform_active_at_trigger,
        "meets_warranty": worker.active_days_30 >= 7,
        "no_duplicate": not await duplicate_claim_exists(db, str(worker.id), str(trigger.id)),
        "within_shift": is_within_shift_hours(
            claim_data.timestamp,
            claim_data.typical_shift_start,
            claim_data.typical_shift_end,
        ),
    }
    failed = [k for k, v in checks.items() if not v]
    return len(failed) == 0, failed, checks


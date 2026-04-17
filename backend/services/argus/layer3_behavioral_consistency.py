from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Claim, ClaimStatus, TriggerEvent

MAX_PAYOUT_THRESHOLD = Decimal("0.99")


def _week_start_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        dt = value.replace(tzinfo=timezone.utc)
    else:
        dt = value.astimezone(timezone.utc)
    return dt - timedelta(days=dt.weekday(), hours=dt.hour, minutes=dt.minute, seconds=dt.second, microseconds=dt.microsecond)


def _consecutive_week_streak(week_starts: list[datetime]) -> int:
    if not week_starts:
        return 0
    streak = 1
    expected_previous = week_starts[0] - timedelta(days=7)
    for week in week_starts[1:]:
        if week == expected_previous:
            streak += 1
            expected_previous = week - timedelta(days=7)
            continue
        break
    return streak


@dataclass(slots=True)
class BehavioralConsistencyResult:
    passed: bool
    risk_score: float
    flags: list[str]
    decision: str
    evidence: dict[str, Any]


async def evaluate_behavioral_consistency(
    db: AsyncSession,
    *,
    worker_id: UUID,
    target_h3_hex: str,
) -> BehavioralConsistencyResult:
    """
    Layer 3 - Historical Behavioral Consistency
    Flags repeated maximum-payout claiming in the exact same hex over
    consecutive weekly windows.
    """
    flags: list[str] = []
    stmt = (
        select(Claim.created_at, Claim.payout_pct)
        .join(TriggerEvent, Claim.trigger_id == TriggerEvent.id)
        .where(
            Claim.worker_id == worker_id,
            TriggerEvent.h3_hex == target_h3_hex,
            Claim.status.in_([ClaimStatus.approved, ClaimStatus.paid]),
            Claim.payout_pct >= MAX_PAYOUT_THRESHOLD,
        )
        .order_by(Claim.created_at.desc())
        .limit(20)
    )
    rows = (await db.execute(stmt)).all()
    if not rows:
        return BehavioralConsistencyResult(
            passed=True,
            risk_score=0.0,
            flags=[],
            decision="approved",
            evidence={
                "target_h3_hex": target_h3_hex,
                "max_payout_claim_weeks": [],
                "consecutive_week_streak": 0,
            },
        )

    week_starts = sorted({_week_start_utc(row.created_at) for row in rows}, reverse=True)
    streak = _consecutive_week_streak(week_starts)
    if streak >= 3:
        flags.append("max_payout_same_hex_3_week_streak")

    if streak >= 3:
        decision = "flagged"
        risk = 0.85
    elif streak == 2:
        decision = "approved"
        risk = 0.35
    else:
        decision = "approved"
        risk = 0.08

    return BehavioralConsistencyResult(
        passed=decision == "approved",
        risk_score=round(risk, 4),
        flags=flags,
        decision=decision,
        evidence={
            "target_h3_hex": target_h3_hex,
            "max_payout_claim_weeks": [week.date().isoformat() for week in week_starts],
            "consecutive_week_streak": streak,
        },
    )


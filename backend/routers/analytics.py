from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import require_admin
from models import BCRRecord, Claim, ClaimStatus, Policy, PolicyStatus, PremiumRecord, Worker
from response import error_response, request_id_from_request, success_response
from services.pythia.stress_test import SCENARIOS, run_stress_scenario

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


class StressTestRequest(BaseModel):
    scenario: str


def _bcr_status(bcr: float) -> str:
    if bcr < 0.70:
        return "healthy"
    if bcr < 0.85:
        return "warning"
    if bcr < 1.0:
        return "critical"
    return "insolvent"


async def _pool_bcr_current_month(db: AsyncSession, now: datetime) -> tuple[list[dict[str, Any]], date]:
    month_start_date = date(year=now.year, month=now.month, day=1)
    month_start_dt = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    trend_start_date = (now - timedelta(days=35)).date()

    premiums_subq = (
        select(
            Policy.pool_id.label("pool_id"),
            func.coalesce(func.sum(PremiumRecord.final_premium), 0).label("total_premiums"),
        )
        .join(Policy, Policy.id == PremiumRecord.policy_id)
        .where(PremiumRecord.week_start >= month_start_date)
        .group_by(Policy.pool_id)
        .subquery()
    )

    claims_subq = (
        select(
            Policy.pool_id.label("pool_id"),
            func.coalesce(func.sum(Claim.payout_amount), 0).label("total_claims"),
            func.coalesce(func.count(Claim.id), 0).label("paid_count"),
        )
        .join(Policy, Policy.id == Claim.policy_id)
        .where(
            Claim.status == ClaimStatus.paid,
            Claim.settled_at.is_not(None),
            Claim.settled_at >= month_start_dt,
        )
        .group_by(Policy.pool_id)
        .subquery()
    )

    all_pool_ids_subq = select(premiums_subq.c.pool_id.label("pool_id")).union(
        select(claims_subq.c.pool_id.label("pool_id"))
    ).subquery()

    rows = (
        await db.execute(
            select(
                all_pool_ids_subq.c.pool_id.label("pool_id"),
                func.coalesce(premiums_subq.c.total_premiums, 0).label("total_premiums"),
                func.coalesce(claims_subq.c.total_claims, 0).label("total_claims"),
                func.coalesce(claims_subq.c.paid_count, 0).label("paid_count"),
            )
            .select_from(all_pool_ids_subq)
            .outerjoin(premiums_subq, premiums_subq.c.pool_id == all_pool_ids_subq.c.pool_id)
            .outerjoin(claims_subq, claims_subq.c.pool_id == all_pool_ids_subq.c.pool_id)
        )
    ).mappings().all()

    trend_rows = (
        await db.execute(
            select(BCRRecord.pool_id, BCRRecord.bcr, BCRRecord.period_end)
            .where(BCRRecord.period_end >= trend_start_date)
            .order_by(BCRRecord.period_end.asc())
        )
    ).all()
    trend_by_pool: dict[str, list[float]] = {}
    for pool_id, bcr, _period_end in trend_rows:
        trend_by_pool.setdefault(pool_id, []).append(round(float(bcr), 4))

    pools: list[dict[str, Any]] = []
    for row in rows:
        premiums = float(row["total_premiums"] or 0)
        claims = float(row["total_claims"] or 0)
        bcr = claims / premiums if premiums else 0.0
        pool_id = str(row["pool_id"])
        pools.append(
            {
                "pool_id": pool_id,
                "total_premiums": round(premiums, 2),
                "total_claims": round(claims, 2),
                "paid_count": int(row["paid_count"] or 0),
                "bcr": round(bcr, 4),
                "status": _bcr_status(bcr),
                "trend_4w": trend_by_pool.get(pool_id, [round(bcr, 4)])[-4:],
                "suspended": bcr >= 0.85,
            }
        )

    pools.sort(key=lambda item: item["pool_id"])
    return pools, month_start_date


@router.get("/bcr")
async def get_bcr(request: Request, _admin: Worker = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    request_id = request_id_from_request(request)
    now = datetime.now(timezone.utc)
    pools, month_start = await _pool_bcr_current_month(db, now)
    return success_response(
        {
            "pools": pools,
            "period": "current_month",
            "month_start": month_start.isoformat(),
            "as_of": now.isoformat(),
        },
        request_id=request_id,
    )


@router.get("/loss-ratio")
async def loss_ratio(request: Request, _admin: Worker = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    request_id = request_id_from_request(request)
    now = datetime.now(timezone.utc)
    window_start = now - timedelta(days=30)
    premiums = float(
        (
            await db.execute(
                select(func.coalesce(func.sum(PremiumRecord.final_premium), 0)).where(
                    PremiumRecord.week_start >= window_start.date()
                )
            )
        ).scalar_one()
    )
    claims = float(
        (
            await db.execute(
                select(func.coalesce(func.sum(Claim.payout_amount), 0)).where(
                    Claim.status == ClaimStatus.paid,
                    Claim.settled_at.is_not(None),
                    Claim.settled_at >= window_start,
                )
            )
        ).scalar_one()
    )
    ratio = claims / premiums if premiums else 0.0
    return success_response(
        {
            "window_days": 30,
            "window_start": window_start.isoformat(),
            "window_end": now.isoformat(),
            "total_premiums": round(premiums, 2),
            "total_claims": round(claims, 2),
            "loss_ratio": round(ratio, 4),
        },
        request_id=request_id,
    )


@router.get("/overview")
async def overview(request: Request, _admin: Worker = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    request_id = request_id_from_request(request)
    now = datetime.now(timezone.utc)
    week_start = now - timedelta(days=7)
    previous_week_start = week_start - timedelta(days=7)
    thirty_days_ago = now - timedelta(days=30)

    active_policies = int((await db.execute(select(func.count(Policy.id)).where(Policy.status == PolicyStatus.active))).scalar_one())
    active_policies_prev = int(
        (
            await db.execute(
                select(func.count(Policy.id)).where(
                    Policy.status == PolicyStatus.active,
                    Policy.activated_at.is_not(None),
                    Policy.activated_at <= week_start,
                    or_(Policy.expires_at.is_(None), Policy.expires_at >= week_start),
                )
            )
        ).scalar_one()
    )
    total_workers = int((await db.execute(select(func.count(Worker.id)))).scalar_one())
    premiums_this_week = float(
        (
            await db.execute(
                select(func.coalesce(func.sum(PremiumRecord.final_premium), 0)).where(
                    PremiumRecord.week_start >= week_start.date()
                )
            )
        ).scalar_one()
    )
    claims_paid_week = float(
        (
            await db.execute(
                select(func.coalesce(func.sum(Claim.payout_amount), 0)).where(
                    Claim.status == ClaimStatus.paid,
                    Claim.settled_at.is_not(None),
                    Claim.settled_at >= week_start,
                )
            )
        ).scalar_one()
    )
    claims_this_week_count = int(
        (
            await db.execute(
                select(func.coalesce(func.count(Claim.id), 0)).where(
                    Claim.created_at >= week_start
                )
            )
        ).scalar_one()
    )
    claims_paid_prev_week = float(
        (
            await db.execute(
                select(func.coalesce(func.sum(Claim.payout_amount), 0)).where(
                    Claim.status == ClaimStatus.paid,
                    Claim.settled_at.is_not(None),
                    Claim.settled_at >= previous_week_start,
                    Claim.settled_at < week_start,
                )
            )
        ).scalar_one()
    )
    claims_this_prev_week_count = int(
        (
            await db.execute(
                select(func.coalesce(func.count(Claim.id), 0)).where(
                    Claim.created_at >= previous_week_start,
                    Claim.created_at < week_start,
                )
            )
        ).scalar_one()
    )
    pending_review_count = int(
        (
            await db.execute(
                select(func.coalesce(func.count(Claim.id), 0)).where(
                    Claim.status.in_([ClaimStatus.flagged, ClaimStatus.blocked])
                )
            )
        ).scalar_one()
    )
    avg_fraud = float(
        (
            await db.execute(
                select(func.coalesce(func.avg(Claim.fraud_score), 0)).where(
                    Claim.created_at >= week_start
                )
            )
        ).scalar_one()
    )
    avg_fraud_prev = float(
        (
            await db.execute(
                select(func.coalesce(func.avg(Claim.fraud_score), 0)).where(
                    Claim.created_at >= previous_week_start,
                    Claim.created_at < week_start,
                )
            )
        ).scalar_one()
    )
    avg_settlement_seconds = float(
        (
            await db.execute(
                select(
                    func.coalesce(
                        func.avg(func.extract("epoch", Claim.settled_at - Claim.created_at)),
                        0,
                    )
                ).where(
                    Claim.status == ClaimStatus.paid,
                    Claim.settled_at.is_not(None),
                    Claim.settled_at >= thirty_days_ago,
                )
            )
        ).scalar_one()
    )
    premiums_30d = float(
        (
            await db.execute(
                select(func.coalesce(func.sum(PremiumRecord.final_premium), 0)).where(
                    PremiumRecord.week_start >= thirty_days_ago.date()
                )
            )
        ).scalar_one()
    )
    claims_30d = float(
        (
            await db.execute(
                select(func.coalesce(func.sum(Claim.payout_amount), 0)).where(
                    Claim.status == ClaimStatus.paid,
                    Claim.settled_at.is_not(None),
                    Claim.settled_at >= thirty_days_ago,
                )
            )
        ).scalar_one()
    )

    pools, month_start = await _pool_bcr_current_month(db, now)
    highest_pool = max(pools, key=lambda item: item["bcr"]) if pools else None
    pool_bcr = float(highest_pool["bcr"]) if highest_pool else 0.0
    pool_bcr_pool_id = str(highest_pool["pool_id"]) if highest_pool else None
    week_bcr = claims_paid_week / premiums_this_week if premiums_this_week else 0.0

    return success_response(
        {
            "active_policies": active_policies,
            "total_workers": total_workers,
            "premiums_this_week": round(premiums_this_week, 2),
            "claims_paid": round(claims_paid_week, 2),
            "claims_paid_week": round(claims_paid_week, 2),
            "claims_this_week_count": claims_this_week_count,
            "pending_review_count": pending_review_count,
            "avg_settlement_time_hours": round(avg_settlement_seconds / 3600, 2),
            "avg_fraud_score": round(avg_fraud, 3),
            "loss_ratio_30d": round((claims_30d / premiums_30d) if premiums_30d else 0.0, 4),
            "pool_bcr": round(pool_bcr, 4),
            "pool_bcr_pool_id": pool_bcr_pool_id,
            "pool_utilization": {
                "pool_id": pool_bcr_pool_id,
                "bcr": round(pool_bcr, 4),
                "status": highest_pool["status"] if highest_pool else None,
            },
            "week_bcr": round(week_bcr, 4),
            "bcr_period": {"month_start": month_start.isoformat(), "as_of": now.isoformat()},
            "previous_week": {
                "active_policies": active_policies_prev,
                "claims_paid": round(claims_paid_prev_week, 2),
                "claims_this_week_count": claims_this_prev_week_count,
                "avg_fraud_score": round(avg_fraud_prev, 3),
            },
        },
        request_id=request_id,
    )


@router.post("/stress-test")
async def stress_test(payload: StressTestRequest, request: Request, _admin: Worker = Depends(require_admin)):
    request_id = request_id_from_request(request)
    if payload.scenario not in SCENARIOS:
        return error_response(
            code="VALIDATION_ERROR",
            message="Unsupported stress test scenario.",
            details={"supported": sorted(SCENARIOS.keys())},
            status_code=400,
            request_id=request_id,
        )
    output = run_stress_scenario(payload.scenario)
    return success_response(
        {
            "scenario": payload.scenario,
            "config": SCENARIOS[payload.scenario],
            "result": {
                "workers_exposed": output.workers_exposed,
                "mean_total_liability": round(output.mean_liability, 2),
                "ci_90": [round(output.ci_low, 2), round(output.ci_high, 2)],
                "pool_reserves": round(output.pool_reserves, 2),
                "pool_adequacy": round(output.pool_adequacy, 3),
                "mean_bcr": round(output.mean_bcr, 3),
                "recommended_reserve_buffer": round(output.reserve_buffer, 2),
                "action": "SUSPEND Tier 4 enrollments" if output.underfunded else "Pool adequate",
            },
        },
        request_id=request_id,
    )

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

import numpy as np
from fastapi import APIRouter, Depends, Request
from sqlalchemy import case, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from constants import H3_ZONES, SUPPORTED_PARAMETRIC_PERILS
from database import get_db
from dependencies import get_current_worker
from models import BCRRecord, BayesianPosterior, Claim, ClaimStatus, H3RiskProfile, Policy, PolicyStatus, TriggerEvent, Worker
from response import error_response, request_id_from_request, success_response

router = APIRouter(prefix="/api", tags=["zones", "liquidity"])
SUPPORTED_PERILS = set(SUPPORTED_PARAMETRIC_PERILS)


def _enum_value(value):
    return value.value if hasattr(value, "value") else value


@router.get("/zones/heatmap")
async def heatmap(request: Request, db: AsyncSession = Depends(get_db)):
    request_id = request_id_from_request(request)
    profiles = (await db.execute(select(H3RiskProfile))).scalars().all()
    posterior_rows = (
        await db.execute(
            select(BayesianPosterior.h3_hex, BayesianPosterior.peril, BayesianPosterior.trigger_prob)
        )
    ).all()
    posterior_map = {
        (row[0], str(_enum_value(row[1]))): float(row[2])
        for row in posterior_rows
        if str(_enum_value(row[1])) in SUPPORTED_PERILS
    }

    workers_by_hex_rows = (
        await db.execute(
            select(Worker.h3_hex, func.count(Worker.id))
            .where(Worker.is_active.is_(True))
            .group_by(Worker.h3_hex)
        )
    ).all()
    workers_by_hex = {row[0]: int(row[1]) for row in workers_by_hex_rows}

    recent_claims_cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    recent_claims_rows = (
        await db.execute(
            select(TriggerEvent.h3_hex, func.count(Claim.id))
            .join(Claim.trigger)
            .where(Claim.created_at >= recent_claims_cutoff)
            .group_by(TriggerEvent.h3_hex)
        )
    ).all()
    recent_claims_by_hex = {row[0]: int(row[1]) for row in recent_claims_rows}

    latest_trigger_ranked = (
        select(
            TriggerEvent.h3_hex.label("h3_hex"),
            TriggerEvent.peril.label("peril"),
            TriggerEvent.reading_value.label("reading_value"),
            TriggerEvent.trigger_level.label("trigger_level"),
            TriggerEvent.triggered_at.label("triggered_at"),
            TriggerEvent.source.label("source"),
            func.row_number()
            .over(
                partition_by=(TriggerEvent.h3_hex, TriggerEvent.peril),
                order_by=TriggerEvent.triggered_at.desc(),
            )
            .label("rn"),
        )
        .subquery()
    )
    latest_trigger_rows = (
        await db.execute(select(latest_trigger_ranked).where(latest_trigger_ranked.c.rn == 1))
    ).mappings().all()
    latest_trigger_map = {
        (row["h3_hex"], str(_enum_value(row["peril"]))): row
        for row in latest_trigger_rows
        if str(_enum_value(row["peril"])) in SUPPORTED_PERILS
    }

    if profiles:
        data = [
            {
                "h3_hex": p.h3_hex,
                "peril": p.peril,
                "city": p.city,
                "pool_id": p.pool_id,
                "urban_tier": p.urban_tier,
                "trigger_prob": posterior_map.get((p.h3_hex, p.peril), float(p.trigger_prob_p50 or 0)),
                "trigger_prob_p10": float(p.trigger_prob_p10 or 0),
                "trigger_prob_p90": float(p.trigger_prob_p90 or 0),
                "posterior_prob": posterior_map.get((p.h3_hex, p.peril)),
                "active_workers": workers_by_hex.get(p.h3_hex, 0),
                "recent_claims": recent_claims_by_hex.get(p.h3_hex, 0),
                "latest_reading_value": (
                    float(latest_trigger_map[(p.h3_hex, p.peril)]["reading_value"])
                    if (p.h3_hex, p.peril) in latest_trigger_map
                    else None
                ),
                "latest_trigger_level": (
                    int(latest_trigger_map[(p.h3_hex, p.peril)]["trigger_level"])
                    if (p.h3_hex, p.peril) in latest_trigger_map
                    else None
                ),
                "latest_triggered_at": (
                    latest_trigger_map[(p.h3_hex, p.peril)]["triggered_at"].isoformat()
                    if (p.h3_hex, p.peril) in latest_trigger_map and latest_trigger_map[(p.h3_hex, p.peril)]["triggered_at"]
                    else None
                ),
                "latest_source": (
                    latest_trigger_map[(p.h3_hex, p.peril)]["source"]
                    if (p.h3_hex, p.peril) in latest_trigger_map
                    else None
                ),
            }
            for p in profiles
            if str(p.peril) in SUPPORTED_PERILS
        ]
    else:
        data = [
            {
                "h3_hex": h3_hex,
                "peril": "rain",
                "city": z["city"],
                "pool_id": z["pool"],
                "urban_tier": z["urban_tier"],
                "trigger_prob": 0.12,
                "trigger_prob_p10": 0.08,
                "trigger_prob_p90": 0.19,
                "posterior_prob": None,
                "active_workers": workers_by_hex.get(h3_hex, 0),
                "recent_claims": recent_claims_by_hex.get(h3_hex, 0),
                "latest_reading_value": None,
                "latest_trigger_level": None,
                "latest_triggered_at": None,
                "latest_source": None,
            }
            for h3_hex, z in H3_ZONES.items()
        ]
    return success_response({"hexes": data}, request_id=request_id)


@router.get("/liquidity/forecast")
async def liquidity_forecast(request: Request, db: AsyncSession = Depends(get_db)):
    request_id = request_id_from_request(request)
    records = (await db.execute(select(BCRRecord).order_by(desc(BCRRecord.period_end)).limit(12))).scalars().all()
    if records:
        records = list(reversed(records))
        x = np.arange(len(records))
        y_claims = np.array([float(r.total_claims) for r in records])
        y_premiums = np.array([float(r.total_premiums) for r in records])
        claim_slope, claim_intercept = np.polyfit(x, y_claims, deg=1)
        premium_slope, premium_intercept = np.polyfit(x, y_premiums, deg=1)
        future = []
        for i in range(1, 9):
            idx = len(records) + i
            projected_claims = max(0.0, float(claim_intercept + claim_slope * idx))
            projected_premiums = max(1.0, float(premium_intercept + premium_slope * idx))
            future.append(
                {
                    "week": i,
                    "projected_claims": round(projected_claims, 2),
                    "projected_premiums": round(projected_premiums, 2),
                    "projected_bcr": round(projected_claims / projected_premiums, 4),
                }
            )
    else:
        future = [
            {"week": i, "projected_claims": 1_200_000 + i * 45_000, "projected_premiums": 1_900_000 + i * 25_000, "projected_bcr": 0.63 + i * 0.02}
            for i in range(1, 9)
        ]
    return success_response({"forecast": future}, request_id=request_id)


@router.get("/profile/me")
async def profile_me(
    request: Request,
    current_worker: Worker = Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    request_id = request_id_from_request(request)

    latest_active_policy_ranked = (
        select(
            Policy.worker_id.label("worker_id"),
            Policy.plan.label("plan"),
            Policy.weekly_premium.label("weekly_premium"),
            Policy.max_payout_week.label("max_payout_week"),
            Policy.policy_number.label("policy_number"),
            Policy.status.label("status"),
            Policy.expires_at.label("expires_at"),
            func.row_number().over(partition_by=Policy.worker_id, order_by=Policy.created_at.desc()).label("rn"),
        )
        .where(Policy.status == PolicyStatus.active)
        .subquery()
    )
    latest_active_policy = select(latest_active_policy_ranked).where(latest_active_policy_ranked.c.rn == 1).subquery()

    stmt = (
        select(
            Worker.id.label("id"),
            Worker.name.label("name"),
            Worker.phone.label("phone"),
            Worker.platform.label("platform"),
            Worker.city.label("city"),
            Worker.h3_hex.label("h3_hex"),
            Worker.tier.label("tier"),
            Worker.active_days_30.label("active_days_30"),
            Worker.role.label("role"),
            latest_active_policy.c.plan.label("policy_plan"),
            latest_active_policy.c.weekly_premium.label("policy_weekly_premium"),
            latest_active_policy.c.max_payout_week.label("policy_max_payout_week"),
            latest_active_policy.c.policy_number.label("policy_number"),
            latest_active_policy.c.status.label("policy_status"),
            latest_active_policy.c.expires_at.label("policy_expires_at"),
        )
        .select_from(Worker)
        .outerjoin(latest_active_policy, latest_active_policy.c.worker_id == Worker.id)
        .where(Worker.id == current_worker.id)
        .limit(1)
    )
    row = (await db.execute(stmt)).mappings().first()
    if not row:
        return error_response(
            code="NOT_FOUND",
            message="Worker not found.",
            status_code=404,
            request_id=request_id,
        )

    policy = (
        {
            "plan": _enum_value(row["policy_plan"]),
            "weekly_premium": float(row["policy_weekly_premium"]),
            "max_payout_week": float(row["policy_max_payout_week"]),
            "policy_number": row["policy_number"],
            "status": _enum_value(row["policy_status"]),
            "expires_at": row["policy_expires_at"].isoformat() if row["policy_expires_at"] else None,
        }
        if row["policy_number"]
        else None
    )

    return success_response(
        {
            "id": str(row["id"]),
            "name": row["name"],
            "phone": row["phone"],
            "platform": _enum_value(row["platform"]),
            "city": row["city"],
            "h3_hex": row["h3_hex"],
            "upi_id": current_worker.upi_id_decrypted,
            "tier": _enum_value(row["tier"]),
            "active_days_30": int(row["active_days_30"]),
            "role": _enum_value(row["role"]),
            "policy": policy,
        },
        request_id=request_id,
    )


@router.get("/dashboard/{worker_id}")
async def worker_dashboard(
    worker_id: str,
    request: Request,
    current_worker: Worker = Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    request_id = request_id_from_request(request)
    try:
        worker_uuid = UUID(worker_id)
    except ValueError:
        return error_response(
            code="FORBIDDEN",
            message="You are not authorized to access this dashboard.",
            status_code=403,
            request_id=request_id,
        )

    if current_worker.id != worker_uuid:
        return error_response(
            code="FORBIDDEN",
            message="You are not authorized to access this dashboard.",
            status_code=403,
            request_id=request_id,
        )

    paid_claims_summary = (
        select(
            Claim.worker_id.label("worker_id"),
            func.coalesce(
                func.sum(
                    case((Claim.status == ClaimStatus.paid, Claim.payout_amount), else_=0),
                ),
                0,
            ).label("total_paid_inr"),
            func.coalesce(
                func.sum(
                    case((Claim.status == ClaimStatus.paid, 1), else_=0),
                ),
                0,
            ).label("paid_count"),
            func.max(
                case((Claim.status == ClaimStatus.paid, Claim.settled_at), else_=None),
            ).label("last_claim_date"),
        )
        .group_by(Claim.worker_id)
        .subquery()
    )

    latest_policy_ranked = (
        select(
            Policy.worker_id.label("worker_id"),
            Policy.policy_number.label("policy_number"),
            Policy.status.label("status"),
            Policy.plan.label("plan"),
            Policy.weekly_premium.label("weekly_premium"),
            Policy.max_payout_week.label("max_payout_week"),
            Policy.activated_at.label("activated_at"),
            Policy.expires_at.label("expires_at"),
            Policy.warranty_met.label("warranty_met"),
            func.row_number()
            .over(
                partition_by=Policy.worker_id,
                order_by=(
                    case((Policy.status == PolicyStatus.active, 0), else_=1),
                    Policy.created_at.desc(),
                ),
            )
            .label("rn"),
        )
        .subquery()
    )
    latest_policy = select(latest_policy_ranked).where(latest_policy_ranked.c.rn == 1).subquery()

    latest_trigger_ranked = (
        select(
            TriggerEvent.h3_hex.label("h3_hex"),
            TriggerEvent.id.label("id"),
            TriggerEvent.peril.label("peril"),
            TriggerEvent.city.label("city"),
            TriggerEvent.payout_pct.label("payout_pct"),
            TriggerEvent.trigger_level.label("trigger_level"),
            TriggerEvent.reading_value.label("reading_value"),
            TriggerEvent.source.label("source"),
            TriggerEvent.triggered_at.label("triggered_at"),
            func.row_number().over(partition_by=TriggerEvent.h3_hex, order_by=TriggerEvent.triggered_at.desc()).label("rn"),
        )
        .where(TriggerEvent.triggered_at >= datetime.now(timezone.utc) - timedelta(hours=24))
        .subquery()
    )
    latest_trigger = select(latest_trigger_ranked).where(latest_trigger_ranked.c.rn == 1).subquery()

    stmt = (
        select(
            Worker.id.label("worker_id"),
            Worker.name.label("worker_name"),
            Worker.phone.label("worker_phone"),
            Worker.platform.label("worker_platform"),
            Worker.tier.label("worker_tier"),
            Worker.city.label("worker_city"),
            latest_policy.c.policy_number,
            latest_policy.c.status.label("policy_status"),
            latest_policy.c.plan.label("policy_plan"),
            latest_policy.c.weekly_premium,
            latest_policy.c.max_payout_week,
            latest_policy.c.activated_at,
            latest_policy.c.expires_at,
            latest_policy.c.warranty_met,
            func.coalesce(paid_claims_summary.c.total_paid_inr, 0).label("total_paid_inr"),
            func.coalesce(paid_claims_summary.c.paid_count, 0).label("paid_count"),
            paid_claims_summary.c.last_claim_date,
            latest_trigger.c.id.label("trigger_id"),
            latest_trigger.c.peril.label("trigger_peril"),
            latest_trigger.c.city.label("trigger_city"),
            latest_trigger.c.payout_pct.label("trigger_payout_pct"),
            latest_trigger.c.trigger_level.label("trigger_level"),
            latest_trigger.c.reading_value.label("trigger_reading_value"),
            latest_trigger.c.source.label("trigger_source"),
            latest_trigger.c.triggered_at.label("triggered_at"),
        )
        .select_from(Worker)
        .outerjoin(latest_policy, latest_policy.c.worker_id == Worker.id)
        .outerjoin(paid_claims_summary, paid_claims_summary.c.worker_id == Worker.id)
        .outerjoin(latest_trigger, latest_trigger.c.h3_hex == Worker.h3_hex)
        .where(Worker.id == worker_uuid)
        .limit(1)
    )
    row = (await db.execute(stmt)).mappings().first()
    if not row:
        return error_response(
            code="NOT_FOUND",
            message="Worker not found.",
            status_code=404,
            request_id=request_id,
        )

    policy = (
        {
            "policy_number": row["policy_number"],
            "status": _enum_value(row["policy_status"]),
            "plan": _enum_value(row["policy_plan"]),
            "weekly_premium": float(row["weekly_premium"]),
            "max_payout_week": float(row["max_payout_week"]),
            "activated_at": row["activated_at"].isoformat() if row["activated_at"] else None,
            "expires_at": row["expires_at"].isoformat() if row["expires_at"] else None,
            "warranty_met": bool(row["warranty_met"]),
        }
        if row["policy_number"]
        else None
    )
    active_trigger = (
        {
            "id": str(row["trigger_id"]),
            "peril": _enum_value(row["trigger_peril"]),
            "peril_label": _enum_value(row["trigger_peril"]).replace("_", " ").title(),
            "city": row["trigger_city"],
            "payout_pct": float(row["trigger_payout_pct"]),
            "trigger_level": int(row["trigger_level"]),
            "reading_value": float(row["trigger_reading_value"]),
            "source": row["trigger_source"],
            "triggered_at": row["triggered_at"].isoformat() if row["triggered_at"] else None,
        }
        if row["trigger_id"]
        else None
    )

    return success_response(
        {
            "worker": {
                "id": str(row["worker_id"]),
                "name": row["worker_name"],
                "phone": row["worker_phone"],
                "platform": _enum_value(row["worker_platform"]),
                "tier": _enum_value(row["worker_tier"]),
                "city": row["worker_city"],
            },
            "policy": policy,
            "claims_summary": {
                "total_paid_inr": float(row["total_paid_inr"] or 0),
                "paid_count": int(row["paid_count"] or 0),
                "last_claim_date": row["last_claim_date"].isoformat() if row["last_claim_date"] else None,
            },
            "active_trigger": active_trigger,
        },
        request_id=request_id,
    )

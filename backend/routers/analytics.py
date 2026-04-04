from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import BCRRecord, Claim, Policy, PolicyStatus, Worker
from response import request_id_from_request, success_response
from services.pythia.stress_test import SCENARIOS, run_stress_scenario

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


class StressTestRequest(BaseModel):
    scenario: str


@router.get("/bcr")
async def get_bcr(request: Request, db: AsyncSession = Depends(get_db)):
    request_id = request_id_from_request(request)
    latest_rows = (await db.execute(select(BCRRecord).order_by(BCRRecord.created_at.desc()).limit(100))).scalars().all()
    pool_map: dict[str, list[BCRRecord]] = {}
    for row in latest_rows:
        pool_map.setdefault(row.pool_id, []).append(row)

    data = []
    for pool_id, rows in pool_map.items():
        rows = sorted(rows, key=lambda r: r.period_end)
        recent = rows[-1]
        trend = [round(float(r.bcr), 4) for r in rows[-4:]]
        data.append(
            {
                "pool_id": pool_id,
                "bcr": round(float(recent.bcr), 4),
                "status": recent.status,
                "trend_4w": trend,
                "suspended": float(recent.bcr) > 0.85,
            }
        )
    return success_response({"pools": data}, request_id=request_id)


@router.get("/loss-ratio")
async def loss_ratio(request: Request, db: AsyncSession = Depends(get_db)):
    request_id = request_id_from_request(request)
    premiums = float((await db.execute(select(func.coalesce(func.sum(Policy.weekly_premium), 0)))).scalar_one())
    claims = float((await db.execute(select(func.coalesce(func.sum(Claim.payout_amount), 0)))).scalar_one())
    ratio = claims / premiums if premiums else 0.0
    return success_response(
        {"total_premiums": premiums, "total_claims": claims, "loss_ratio": round(ratio, 4)},
        request_id=request_id,
    )


@router.get("/overview")
async def overview(request: Request, db: AsyncSession = Depends(get_db)):
    request_id = request_id_from_request(request)
    active_policies = int((await db.execute(select(func.count(Policy.id)).where(Policy.status == PolicyStatus.active))).scalar_one())
    total_workers = int((await db.execute(select(func.count(Worker.id)))).scalar_one())
    premiums_this_week = float((await db.execute(select(func.coalesce(func.sum(Policy.weekly_premium), 0)))).scalar_one())
    claims_paid = float((await db.execute(select(func.coalesce(func.sum(Claim.payout_amount), 0)))).scalar_one())
    avg_fraud = float((await db.execute(select(func.coalesce(func.avg(Claim.fraud_score), 0)))).scalar_one())
    pool_bcr = claims_paid / premiums_this_week if premiums_this_week else 0.0
    return success_response(
        {
            "active_policies": active_policies,
            "total_workers": total_workers,
            "premiums_this_week": premiums_this_week,
            "claims_paid": claims_paid,
            "avg_fraud_score": round(avg_fraud, 3),
            "pool_bcr": round(pool_bcr, 4),
        },
        request_id=request_id,
    )


@router.post("/stress-test")
async def stress_test(payload: StressTestRequest, request: Request):
    request_id = request_id_from_request(request)
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

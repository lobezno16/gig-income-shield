from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_worker
from models import PlanType, Platform, Policy, PremiumRecord, Worker, WorkerTier
from response import error_response, request_id_from_request, success_response
from schemas.premium import PremiumCalculationRequest, PredictiveCoverageRequest
from constants import BILLING_CADENCE, LOSS_SCOPE, PRODUCT_CODE, SUPPORTED_PARAMETRIC_PERILS
from services.athena.premium_engine import AthenaPremiumEngine

router = APIRouter(prefix="/api/premium", tags=["premium"])


def _is_owner(current_worker: Worker, worker_id: str) -> bool:
    try:
        return current_worker.id == UUID(worker_id)
    except ValueError:
        return False


@router.get("/{worker_id}")
async def get_premium(
    worker_id: str,
    request: Request,
    current_worker: Worker = Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    request_id = request_id_from_request(request)
    if not _is_owner(current_worker, worker_id):
        return error_response("FORBIDDEN", "You are not authorized to access this premium data.", status_code=403, request_id=request_id)

    worker = (await db.execute(select(Worker).where(Worker.id == worker_id))).scalar_one_or_none()
    policy = (await db.execute(select(Policy).where(Policy.worker_id == worker_id).order_by(desc(Policy.created_at)))).scalars().first()
    if not worker or not policy:
        return error_response("NOT_FOUND", "Worker or policy not found.", status_code=404, request_id=request_id)

    engine = AthenaPremiumEngine(db)
    result = await engine.calculate_premium(worker, policy.plan, policy.pool_id, policy.urban_tier)

    return success_response(
        {
            "worker_id": worker_id,
            "policy_number": policy.policy_number,
            "formula_breakdown": {
                "trigger_probability": result.trigger_probability,
                "avg_daily_income": {"zepto": 1000, "zomato": 950, "swiggy": 900, "blinkit": 980}[worker.platform.value],
                "days_covered": result.days_covered,
                "base_cost": result.base_cost,
                "city_factor": result.city_factor,
                "peril_factor": result.peril_factor,
                "worker_tier_factor": result.tier_factor,
                "ml_adjustment_inr": result.ml_adjustment,
                "raw_premium": result.raw_premium,
                "final_premium": result.final_premium,
            },
            "shap_values": result.shap_values,
            "base_value": result.base_value,
            "assumptions": [
                "Trigger probability estimated with Bayesian posterior from historical and recent events.",
                "Daily income baseline uses platform-level averages for Q-Commerce partners.",
                "Urban tier multiplier captures disruption duration effects from infrastructure differences.",
            ],
            "product_constraints": {
                "product_code": PRODUCT_CODE,
                "loss_scope": LOSS_SCOPE,
                "billing_cadence": BILLING_CADENCE,
                "covered_perils": list(SUPPORTED_PARAMETRIC_PERILS),
            },
        },
        request_id=request_id,
    )


@router.post("/calculate")
async def calculate_preview(payload: PremiumCalculationRequest, request: Request, db: AsyncSession = Depends(get_db)):
    request_id = request_id_from_request(request)
    worker = Worker(
        phone="+910000000000",
        name="Preview Worker",
        platform=Platform(payload.platform),
        platform_id="preview",
        city=payload.city,
        h3_hex=payload.h3_hex,
        upi_id="preview@ybl",
        tier=WorkerTier(payload.tier),
        active_days_30=12,
        is_active=True,
    )
    engine = AthenaPremiumEngine(db)
    result = await engine.calculate_premium(worker, PlanType(payload.plan), f"{payload.city}_pool", 1)
    return success_response(
        {
            "preview": True,
            "breakdown": {
                "trigger_probability": result.trigger_probability,
                "base_cost": result.base_cost,
                "city_factor": result.city_factor,
                "peril_factor": result.peril_factor,
                "worker_tier_factor": result.tier_factor,
                "ml_adjustment_inr": result.ml_adjustment,
                "raw_premium": result.raw_premium,
                "final_premium": result.final_premium,
            },
            "shap_values": result.shap_values,
            "features": result.features,
        },
        request_id=request_id,
    )


@router.get("/{worker_id}/history")
async def premium_history(
    worker_id: str,
    request: Request,
    current_worker: Worker = Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    request_id = request_id_from_request(request)
    if not _is_owner(current_worker, worker_id):
        return error_response("FORBIDDEN", "You are not authorized to access this premium history.", status_code=403, request_id=request_id)

    stmt = select(PremiumRecord).where(PremiumRecord.worker_id == worker_id).order_by(desc(PremiumRecord.week_start)).limit(12)
    records = (await db.execute(stmt)).scalars().all()
    if not records:
        # deterministic fallback history
        today = date.today()
        records = [
            PremiumRecord(week_start=today - timedelta(weeks=i), final_premium=35, base_formula=57, ml_adjustment=2)
            for i in range(12)
        ]
    data = [
        {
            "week_start": r.week_start.isoformat(),
            "final_premium": float(r.final_premium),
            "base_formula": float(r.base_formula),
            "ml_adjustment": float(r.ml_adjustment),
        }
        for r in records
    ]
    return success_response({"worker_id": worker_id, "history": data}, request_id=request_id)


@router.post("/predictive-coverage")
async def predictive_coverage(
    payload: PredictiveCoverageRequest,
    request: Request,
    current_worker: Worker = Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    request_id = request_id_from_request(request)
    if str(current_worker.id) != payload.worker_id:
        return error_response("FORBIDDEN", "You are not authorized to access predictive coverage for another worker.", status_code=403, request_id=request_id)

    policy = (await db.execute(select(Policy).where(Policy.worker_id == payload.worker_id).order_by(desc(Policy.created_at)))).scalars().first()
    if not policy:
        return error_response("NOT_FOUND", "Policy not found.", status_code=404, request_id=request_id)

    uplift = 0.0
    if payload.peril in {"rain", "aqi", "curfew"}:
        uplift = min(0.25, payload.days_requested / 30)
    extended_premium = float(policy.weekly_premium) * (1 + uplift)

    return success_response(
        {
            "worker_id": payload.worker_id,
            "peril": payload.peril,
            "days_requested": payload.days_requested,
            "recommended_weekly_premium_inr": round(extended_premium, 2),
            "coverage_extension_factor": round(1 + uplift, 3),
        },
        request_id=request_id,
    )

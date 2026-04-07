from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from constants import IRDAI_EXCLUSIONS
from database import get_db
from dependencies import get_current_worker
from models import PlanType, Policy, PremiumRecord, Worker
from response import error_response, request_id_from_request, success_response
from schemas.policy import UpdatePlanRequest
from services.athena.premium_engine import AthenaPremiumEngine

router = APIRouter(prefix="/api/policy", tags=["policy"])


def _is_owner(current_worker: Worker, worker_id: str) -> bool:
    try:
        return current_worker.id == UUID(worker_id)
    except ValueError:
        return False


def _policy_payload(policy: Policy, worker: Worker, premium_record: PremiumRecord | None) -> dict:
    shap_values = premium_record.shap_values if premium_record else {}
    shap_top = sorted(
        [(k, v) for k, v in shap_values.items() if isinstance(v, (float, int))],
        key=lambda x: abs(x[1]),
        reverse=True,
    )[:3]

    return {
        "policy_number": policy.policy_number,
        "worker": {
            "id": str(worker.id),
            "name": worker.name,
            "phone": worker.phone,
            "platform": worker.platform.value,
            "tier": worker.tier.value,
            "h3_hex": worker.h3_hex,
            "active_days_30": worker.active_days_30,
        },
        "coverage": {
            "plan": policy.plan.value,
            "status": policy.status.value,
            "pool": policy.pool_id,
            "urban_tier": policy.urban_tier,
            "weekly_premium_inr": float(policy.weekly_premium),
            "max_payout_per_week_inr": float(policy.max_payout_week),
            "coverage_days_per_week": policy.coverage_days,
            "covered_perils": policy.coverage_perils,
            "warranty_met": policy.warranty_met,
            "activated_at": policy.activated_at.isoformat() if policy.activated_at else None,
            "expires_at": policy.expires_at.isoformat() if policy.expires_at else None,
        },
        "irdai_compliance": {
            "sandbox_id": policy.irdai_sandbox_id,
            "product_type": "parametric_income_protection",
            "exclusions_version": "v2.1",
            "exclusions": IRDAI_EXCLUSIONS,
        },
        "premium_this_week": {
            "amount_inr": float(policy.weekly_premium),
            "calculation_date": datetime.now(timezone.utc).date().isoformat(),
            "trigger_probability": float((premium_record.bayesian_probs or {}).get("rain", 0.12)) if premium_record else 0.12,
            "shap_top_features": [f"{k}: {v:+.1f}" for k, v in shap_top],
        },
    }


@router.get("/{worker_id}")
async def get_policy(
    worker_id: str,
    request: Request,
    current_worker: Worker = Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    request_id = request_id_from_request(request)
    if not _is_owner(current_worker, worker_id):
        return error_response("FORBIDDEN", "You are not authorized to access this policy.", status_code=403, request_id=request_id)

    policy_stmt = select(Policy).where(Policy.worker_id == worker_id).order_by(desc(Policy.created_at))
    policy = (await db.execute(policy_stmt)).scalars().first()
    if not policy:
        return error_response("NOT_FOUND", "Policy not found for worker.", status_code=404, request_id=request_id)

    worker = (await db.execute(select(Worker).where(Worker.id == worker_id))).scalar_one_or_none()
    if not worker:
        return error_response("NOT_FOUND", "Worker not found.", status_code=404, request_id=request_id)

    premium_record = (
        await db.execute(select(PremiumRecord).where(PremiumRecord.policy_id == policy.id).order_by(desc(PremiumRecord.created_at)))
    ).scalars().first()
    return success_response(_policy_payload(policy, worker, premium_record), request_id=request_id)


@router.put("/{worker_id}/plan")
async def update_plan(
    worker_id: str,
    payload: UpdatePlanRequest,
    request: Request,
    current_worker: Worker = Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    request_id = request_id_from_request(request)
    if not _is_owner(current_worker, worker_id):
        return error_response("FORBIDDEN", "You are not authorized to update this policy.", status_code=403, request_id=request_id)

    worker = (await db.execute(select(Worker).where(Worker.id == worker_id))).scalar_one_or_none()
    policy = (await db.execute(select(Policy).where(Policy.worker_id == worker_id).order_by(desc(Policy.created_at)))).scalars().first()
    if not worker or not policy:
        return error_response("NOT_FOUND", "Worker/policy not found.", status_code=404, request_id=request_id)

    athena = AthenaPremiumEngine(db)
    result = await athena.calculate_premium(worker, PlanType(payload.plan), policy.pool_id, policy.urban_tier)

    policy.plan = PlanType(payload.plan)
    policy.weekly_premium = result.final_premium
    policy.max_payout_week = result.max_payout
    policy.coverage_days = result.days_covered
    await db.commit()
    await db.refresh(policy)

    record = PremiumRecord(
        worker_id=worker.id,
        policy_id=policy.id,
        week_start=datetime.now(timezone.utc).date(),
        base_formula=result.base_cost,
        ml_adjustment=result.ml_adjustment,
        final_premium=result.final_premium,
        shap_values=result.shap_values,
        bayesian_probs={result.peril: result.trigger_probability},
        features=result.features,
    )
    db.add(record)
    await db.commit()

    return success_response(
        {
            "worker_id": worker_id,
            "plan": policy.plan.value,
            "weekly_premium_inr": float(policy.weekly_premium),
            "max_payout_per_week_inr": float(policy.max_payout_week),
            "coverage_days_per_week": policy.coverage_days,
        },
        request_id=request_id,
    )

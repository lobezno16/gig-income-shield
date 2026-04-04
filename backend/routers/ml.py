from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Policy, PremiumRecord, Worker
from response import error_response, request_id_from_request, success_response
from services.athena.premium_engine import AthenaPremiumEngine

router = APIRouter(prefix="/api/ml", tags=["ml"])


@router.get("/feature-importance")
async def feature_importance(request: Request, db: AsyncSession = Depends(get_db)):
    request_id = request_id_from_request(request)
    engine = AthenaPremiumEngine(db)
    artifacts = engine.rf_model.load_or_train_default()
    importance_pairs = list(zip(artifacts.feature_names, artifacts.model.feature_importances_.tolist()))
    ranked = sorted(importance_pairs, key=lambda x: x[1], reverse=True)
    return success_response(
        {
            "features": [{"name": name, "importance": round(val, 4)} for name, val in ranked],
            "model": {"n_estimators": 200, "max_depth": 8, "min_samples_leaf": 20},
        },
        request_id=request_id,
    )


@router.get("/shap/{worker_id}")
async def worker_shap(worker_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    request_id = request_id_from_request(request)
    worker = (await db.execute(select(Worker).where(Worker.id == worker_id))).scalar_one_or_none()
    policy = (await db.execute(select(Policy).where(Policy.worker_id == worker_id).order_by(desc(Policy.created_at)))).scalar_one_or_none()
    if not worker or not policy:
        return error_response("NOT_FOUND", "Worker or policy not found.", status_code=404, request_id=request_id)
    engine = AthenaPremiumEngine(db)
    result = await engine.calculate_premium(worker, policy.plan, policy.pool_id, policy.urban_tier)
    return success_response(
        {
            "worker_id": worker_id,
            "policy_number": policy.policy_number,
            "shap_values": result.shap_values,
            "base_value": result.base_value,
            "prediction_adjustment": result.ml_adjustment,
        },
        request_id=request_id,
    )


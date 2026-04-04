from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Claim, ClaimStatus, Policy, PremiumRecord, Worker
from response import error_response, request_id_from_request, success_response
from services.pythia.stress_test import SCENARIOS
from ml.train import train_models

router = APIRouter(prefix="/api/admin", tags=["admin"])


class ClaimOverrideRequest(BaseModel):
    release_pct: float = 0.8
    note: str = "Manual override by admin"


@router.post("/retrain-model")
async def retrain_model(request: Request):
    request_id = request_id_from_request(request)
    artifacts = train_models("./ml/models")
    return success_response(
        {"status": "ok", "trained_at": datetime.utcnow().isoformat(), "artifacts": artifacts},
        request_id=request_id,
    )


@router.get("/workers")
async def list_workers(page: int = 1, page_size: int = 20, request: Request | None = None, db: AsyncSession = Depends(get_db)):
    request_id = request_id_from_request(request) if request else "admin-workers"
    offset = (page - 1) * page_size
    items = (await db.execute(select(Worker).order_by(desc(Worker.created_at)).offset(offset).limit(page_size))).scalars().all()
    total = int((await db.execute(select(func.count(Worker.id)))).scalar_one())
    return success_response(
        {
            "items": [
                {
                    "id": str(w.id),
                    "name": w.name,
                    "phone": w.phone,
                    "platform": w.platform.value,
                    "tier": w.tier.value,
                    "city": w.city,
                    "h3_hex": w.h3_hex,
                    "active_days_30": w.active_days_30,
                }
                for w in items
            ],
            "page": page,
            "page_size": page_size,
            "total": total,
        },
        request_id=request_id,
    )


@router.get("/fraud-alerts")
async def fraud_alerts(request: Request, db: AsyncSession = Depends(get_db)):
    request_id = request_id_from_request(request)
    rows = (
        await db.execute(
            select(Claim)
            .where(Claim.status.in_([ClaimStatus.flagged, ClaimStatus.blocked]))
            .order_by(desc(Claim.created_at))
            .limit(20)
        )
    ).scalars().all()
    alerts = [
        {
            "claim_id": str(c.id),
            "claim_number": c.claim_number,
            "status": c.status.value,
            "fraud_score": float(c.fraud_score or 0),
            "flags": c.fraud_flags or [],
            "h3_cluster": c.argus_layers.get("layer0", {}).get("checks", {}),
            "created_at": c.created_at.isoformat(),
        }
        for c in rows
    ]
    return success_response({"alerts": alerts}, request_id=request_id)


@router.post("/claims/{claim_id}/override")
async def override_claim(claim_id: str, payload: ClaimOverrideRequest, request: Request, db: AsyncSession = Depends(get_db)):
    request_id = request_id_from_request(request)
    claim = (await db.execute(select(Claim).where(Claim.id == claim_id))).scalar_one_or_none()
    if not claim:
        return error_response("NOT_FOUND", "Claim not found.", status_code=404, request_id=request_id)
    if payload.release_pct <= 0:
        claim.status = ClaimStatus.blocked
    else:
        claim.status = ClaimStatus.approved
        claim.payout_amount = float(claim.payout_amount) * min(1.0, payload.release_pct)
    claim.argus_layers = {**(claim.argus_layers or {}), "admin_override": {"note": payload.note, "release_pct": payload.release_pct}}
    await db.commit()
    await db.refresh(claim)
    return success_response(
        {
            "claim_id": claim_id,
            "status": claim.status.value,
            "payout_amount": float(claim.payout_amount),
            "note": payload.note,
        },
        request_id=request_id,
    )


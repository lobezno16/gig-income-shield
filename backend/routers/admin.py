from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from dependencies import require_admin
from ml.train import train_models
from models import Claim, ClaimStatus, Platform, Worker, WorkerTier
from response import error_response, request_id_from_request, success_response

router = APIRouter(prefix="/api/admin", tags=["admin"])

ALL_CLAIM_STATUSES = [status.value for status in ClaimStatus]


class ClaimOverrideRequest(BaseModel):
    release_pct: float = 0.8
    note: str = "Manual override by admin"


def _claim_flags(value: object) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value]
    return []


def _claim_alert_payload(claim: Claim) -> dict:
    layer3 = (claim.argus_layers or {}).get("layer3", {})
    cluster_size_raw = layer3.get("cluster_size", 1)
    try:
        cluster_size = int(cluster_size_raw)
    except (TypeError, ValueError):
        cluster_size = 1

    hexes: list[str] = []
    if claim.trigger is not None:
        hexes.append(claim.trigger.h3_hex)

    peril = claim.trigger.peril.value if claim.trigger is not None else "unknown"
    created_iso = claim.created_at.isoformat()

    return {
        "claim_id": str(claim.id),
        "claim_number": claim.claim_number,
        "fraud_score": float(claim.fraud_score or 0),
        "flags": _claim_flags(claim.fraud_flags),
        "cluster_size": cluster_size,
        "hexes": hexes,
        "trigger": peril,
        "temporal_window": "last_24h",
        "status": claim.status.value,
        "created_at": created_iso,
    }


@router.post("/retrain-model")
async def retrain_model(request: Request, _admin: Worker = Depends(require_admin)):
    request_id = request_id_from_request(request)
    artifacts = train_models("./ml/models")
    return success_response(
        {"status": "ok", "trained_at": datetime.now(timezone.utc).isoformat(), "artifacts": artifacts},
        request_id=request_id,
    )


@router.get("/workers")
async def list_workers(
    request: Request,
    _admin: Worker = Depends(require_admin),
    page: int = 1,
    page_size: int = 20,
    search: str | None = None,
    platform: str | None = None,
    tier: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    request_id = request_id_from_request(request)
    filters = []
    if search:
        pattern = f"%{search.strip()}%"
        filters.append(
            or_(
                Worker.name.ilike(pattern),
                Worker.phone.ilike(pattern),
            )
        )
    if platform:
        try:
            filters.append(Worker.platform == Platform(platform.lower()))
        except ValueError:
            return error_response(
                "VALIDATION_ERROR",
                "Invalid platform filter.",
                details={"allowed": [p.value for p in Platform]},
                status_code=400,
                request_id=request_id,
            )
    if tier:
        try:
            filters.append(Worker.tier == WorkerTier(tier.lower()))
        except ValueError:
            return error_response(
                "VALIDATION_ERROR",
                "Invalid tier filter.",
                details={"allowed": [t.value for t in WorkerTier]},
                status_code=400,
                request_id=request_id,
            )

    offset = (page - 1) * page_size
    items = (
        await db.execute(
            select(Worker)
            .where(*filters)
            .order_by(desc(Worker.created_at))
            .offset(offset)
            .limit(page_size)
        )
    ).scalars().all()
    total = int((await db.execute(select(func.count(Worker.id)).where(*filters))).scalar_one())
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
            "filters": {"search": search or "", "platform": platform, "tier": tier},
        },
        request_id=request_id,
    )


@router.get("/claims")
async def list_claims(
    request: Request,
    _admin: Worker = Depends(require_admin),
    status: str = "all",
    page: int = 1,
    page_size: int = 50,
    db: AsyncSession = Depends(get_db),
):
    request_id = request_id_from_request(request)
    status_key = status.lower().strip()
    status_filter = None
    if status_key != "all":
        try:
            status_filter = ClaimStatus(status_key)
        except ValueError:
            return error_response(
                "VALIDATION_ERROR",
                "Invalid claim status filter.",
                details={"allowed": ["all", *ALL_CLAIM_STATUSES]},
                status_code=400,
                request_id=request_id,
            )

    filters = [Claim.status == status_filter] if status_filter is not None else []
    offset = max(0, (page - 1) * page_size)
    rows = (
        await db.execute(
            select(Claim)
            .options(selectinload(Claim.worker), selectinload(Claim.trigger))
            .where(*filters)
            .order_by(desc(Claim.created_at))
            .offset(offset)
            .limit(page_size)
        )
    ).scalars().all()
    total = int((await db.execute(select(func.count(Claim.id)).where(*filters))).scalar_one())
    status_rows = (await db.execute(select(Claim.status, func.count(Claim.id)).group_by(Claim.status))).all()

    counts = {"all": sum(int(row[1]) for row in status_rows)}
    for claim_status in ClaimStatus:
        counts[claim_status.value] = 0
    for claim_status, count in status_rows:
        key = claim_status.value if hasattr(claim_status, "value") else str(claim_status)
        counts[key] = int(count)

    items = []
    for claim in rows:
        peril = claim.trigger.peril.value if claim.trigger is not None else "unknown"
        h3_hex = claim.trigger.h3_hex if claim.trigger is not None else None
        city = claim.trigger.city if claim.trigger is not None else None
        items.append(
            {
                "id": str(claim.id),
                "claim_number": claim.claim_number,
                "status": claim.status.value,
                "worker_id": str(claim.worker_id),
                "worker_name": claim.worker.name if claim.worker is not None else "Unknown",
                "payout_amount": float(claim.payout_amount),
                "payout_pct": float(claim.payout_pct),
                "fraud_score": float(claim.fraud_score or 0),
                "fraud_flags": _claim_flags(claim.fraud_flags),
                "argus_layers": claim.argus_layers or {},
                "peril": peril,
                "h3_hex": h3_hex,
                "city": city,
                "created_at": claim.created_at.isoformat(),
                "settled_at": claim.settled_at.isoformat() if claim.settled_at else None,
            }
        )

    return success_response(
        {
            "items": items,
            "counts": counts,
            "status": status_key,
            "page": page,
            "page_size": page_size,
            "total": total,
        },
        request_id=request_id,
    )


@router.get("/fraud-alerts")
async def fraud_alerts(request: Request, _admin: Worker = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    request_id = request_id_from_request(request)
    rows = (
        await db.execute(
            select(Claim)
            .options(selectinload(Claim.trigger))
            .where(Claim.status.in_([ClaimStatus.flagged, ClaimStatus.blocked]))
            .order_by(desc(Claim.created_at))
            .limit(20)
        )
    ).scalars().all()
    alerts = [_claim_alert_payload(claim) for claim in rows]
    return success_response({"alerts": alerts}, request_id=request_id)


@router.post("/claims/{claim_id}/override")
async def override_claim(
    claim_id: str,
    payload: ClaimOverrideRequest,
    request: Request,
    _admin: Worker = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    request_id = request_id_from_request(request)
    claim_uuid: UUID | None = None
    try:
        claim_uuid = UUID(claim_id)
    except ValueError:
        claim_uuid = None

    if claim_uuid is not None:
        claim = (
            await db.execute(
                select(Claim).where(
                    or_(Claim.id == claim_uuid, Claim.claim_number == claim_id)
                )
            )
        ).scalar_one_or_none()
    else:
        claim = (await db.execute(select(Claim).where(Claim.claim_number == claim_id))).scalar_one_or_none()

    if not claim:
        return error_response("NOT_FOUND", "Claim not found.", status_code=404, request_id=request_id)

    if payload.release_pct <= 0:
        claim.status = ClaimStatus.blocked
    else:
        claim.status = ClaimStatus.approved
        claim.payout_amount = float(claim.payout_amount) * min(1.0, payload.release_pct)
    claim.argus_layers = {
        **(claim.argus_layers or {}),
        "admin_override": {
            "note": payload.note,
            "release_pct": payload.release_pct,
        },
    }
    await db.commit()
    await db.refresh(claim)
    return success_response(
        {
            "claim_id": str(claim.id),
            "claim_number": claim.claim_number,
            "status": claim.status.value,
            "payout_amount": float(claim.payout_amount),
            "note": payload.note,
        },
        request_id=request_id,
    )

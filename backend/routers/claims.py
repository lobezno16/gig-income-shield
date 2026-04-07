from __future__ import annotations

from datetime import timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_worker
from events import event_bus
from models import Claim, TriggerEvent, Worker
from response import error_response, request_id_from_request, success_response
from schemas.claim import CreateClaimRequest
from services.claims_orchestrator import orchestrate_claim_for_worker

router = APIRouter(prefix="/api", tags=["claims"])


def _is_owner(current_worker: Worker, worker_id: str) -> bool:
    try:
        return current_worker.id == UUID(worker_id)
    except ValueError:
        return False


def build_claim_timeline(claim: Claim, worker: Worker, amount: float) -> list[dict]:
    created = claim.created_at.astimezone(timezone.utc)
    final_status = claim.status.value if hasattr(claim.status, "value") else str(claim.status)
    all_steps = [
        {
            "id": "trigger_detected",
            "label": "Disruption Detected",
            "description": "CPCB/IMD threshold breached for insured H3 zone.",
            "timestamp": created.isoformat(),
        },
        {
            "id": "eligibility_check",
            "label": "Eligibility Verified",
            "description": "Active policy · Warranty met · Zone confirmed",
            "timestamp": created.isoformat(),
        },
        {
            "id": "fraud_check",
            "label": "Verification Complete",
            "description": f"ARGUS complete · score {float(claim.fraud_score or 0):.2f}",
            "timestamp": created.isoformat(),
        },
        {
            "id": "payout_calculated",
            "label": "Payout Calculated",
            "description": f"Auto-calculated payout Rs {amount:.0f}",
            "timestamp": created.isoformat(),
        },
        {
            "id": "transfer_initiated",
            "label": "Transfer Initiated",
            "description": f"Settlement initiated to {worker.upi_id}",
            "timestamp": created.isoformat(),
        },
        {
            "id": "confirmed",
            "label": "Payment Confirmed",
            "description": f"UPI Ref: {claim.upi_ref or 'PENDING'}",
            "timestamp": (claim.settled_at or created).isoformat(),
        },
    ]
    status_index = {
        "processing": 3,
        "approved": 4,
        "flagged": 4,
        "blocked": 2,
        "paid": 5,
    }.get(final_status, 2)
    for idx, item in enumerate(all_steps):
        if idx < status_index:
            item["status"] = "completed"
        elif idx == status_index:
            item["status"] = "active"
        else:
            item["status"] = "future"
    return all_steps


@router.get("/claims/{worker_id}")
async def get_claims(
    worker_id: str,
    request: Request,
    current_worker: Worker = Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    request_id = request_id_from_request(request)
    if not _is_owner(current_worker, worker_id):
        return error_response("FORBIDDEN", "You are not authorized to access this worker's claims.", status_code=403, request_id=request_id)

    stmt = select(Claim).where(Claim.worker_id == worker_id).order_by(Claim.created_at.desc())
    claims = (await db.execute(stmt)).scalars().all()
    result = []
    for c in claims:
        worker = (await db.execute(select(Worker).where(Worker.id == c.worker_id))).scalar_one()
        result.append(
            {
                "id": str(c.id),
                "claim_number": c.claim_number,
                "status": c.status.value,
                "payout_amount": float(c.payout_amount),
                "payout_pct": float(c.payout_pct),
                "fraud_score": float(c.fraud_score) if c.fraud_score is not None else None,
                "fraud_flags": c.fraud_flags or [],
                "argus_layers": c.argus_layers or {},
                "timeline": build_claim_timeline(c, worker, float(c.payout_amount)),
                "created_at": c.created_at.isoformat(),
                "settled_at": c.settled_at.isoformat() if c.settled_at else None,
            }
        )
    return success_response({"worker_id": worker_id, "claims": result}, request_id=request_id)


@router.get("/claims/{worker_id}/{claim_id}")
async def get_claim_detail(
    worker_id: str,
    claim_id: str,
    request: Request,
    current_worker: Worker = Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    request_id = request_id_from_request(request)
    if not _is_owner(current_worker, worker_id):
        return error_response("FORBIDDEN", "You are not authorized to access this claim.", status_code=403, request_id=request_id)

    stmt = select(Claim).where(Claim.id == claim_id, Claim.worker_id == worker_id)
    claim = (await db.execute(stmt)).scalar_one_or_none()
    if not claim:
        return error_response("NOT_FOUND", "Claim not found.", status_code=404, request_id=request_id)
    worker = (await db.execute(select(Worker).where(Worker.id == claim.worker_id))).scalar_one()
    return success_response(
        {
            "id": str(claim.id),
            "claim_number": claim.claim_number,
            "status": claim.status.value,
            "payout_amount": float(claim.payout_amount),
            "payout_pct": float(claim.payout_pct),
            "fraud_score": float(claim.fraud_score) if claim.fraud_score is not None else None,
            "fraud_flags": claim.fraud_flags or [],
            "argus_layers": claim.argus_layers or {},
            "timeline": build_claim_timeline(claim, worker, float(claim.payout_amount)),
            "created_at": claim.created_at.isoformat(),
            "settled_at": claim.settled_at.isoformat() if claim.settled_at else None,
        },
        request_id=request_id,
    )


@router.post("/claims/create")
async def create_claim(
    payload: CreateClaimRequest,
    request: Request,
    current_worker: Worker = Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    request_id = request_id_from_request(request)
    if str(current_worker.id) != payload.worker_id:
        return error_response("FORBIDDEN", "You are not authorized to create claims for another worker.", status_code=403, request_id=request_id)

    worker = (await db.execute(select(Worker).where(Worker.id == payload.worker_id))).scalar_one_or_none()
    if not worker:
        return error_response("NOT_FOUND", "Worker not found.", status_code=404, request_id=request_id)

    trigger = (await db.execute(select(TriggerEvent).where(TriggerEvent.id == payload.trigger_id))).scalar_one_or_none()
    if not trigger:
        return error_response("NOT_FOUND", "Trigger not found.", status_code=404, request_id=request_id)

    claim, settlement_info = await orchestrate_claim_for_worker(
        db,
        worker=worker,
        trigger=trigger,
        gps_lat=payload.gps_lat,
        gps_lng=payload.gps_lng,
        platform_active_at_trigger=payload.platform_active_at_trigger,
        timestamp=payload.timestamp,
        typical_shift_start=payload.typical_shift_start,
        typical_shift_end=payload.typical_shift_end,
    )
    if claim is None:
        return error_response("NOT_ELIGIBLE", "Worker does not have an active policy.", status_code=400, request_id=request_id)

    return success_response(
        {
            "claim_id": str(claim.id),
            "claim_number": claim.claim_number,
            "status": claim.status.value,
            "payout_amount": float(claim.payout_amount),
            "fraud_score": float(claim.fraud_score or 0),
            "settlement": {
                "status": settlement_info["settlement_status"],
                "attempts": settlement_info["attempts"],
                "message": settlement_info["message"],
                "upi_ref": claim.upi_ref,
            },
        },
        request_id=request_id,
    )


@router.post("/claims")
async def create_claim_alias(
    payload: CreateClaimRequest,
    request: Request,
    current_worker: Worker = Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    # Alias maintained for API-contract flexibility around /api/claims POST.
    return await create_claim(payload, request, current_worker, db)


@router.get("/sse/claims")
async def claims_sse():
    async def event_generator():
        async for event in event_bus.subscribe("claims"):
            yield event

    return StreamingResponse(event_generator(), media_type="text/event-stream")

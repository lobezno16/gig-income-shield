from __future__ import annotations

from datetime import timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from config import get_settings
from database import get_db
from dependencies import get_current_worker
from middleware.rate_limit import RateLimitExceeded, rate_limit
from events import event_bus
from models import Claim, TriggerEvent, Worker
from redis_client import get_redis
from response import error_response, request_id_from_request, success_response
from schemas.claim import CreateClaimRequest
from services.claims_orchestrator import orchestrate_claim_for_worker

router = APIRouter(prefix="/api", tags=["claims"])
settings = get_settings()


def _is_owner(current_worker: Worker, worker_id: str) -> bool:
    try:
        return current_worker.id == UUID(worker_id)
    except ValueError:
        return False


def _parse_settlement_refs(ref_value: str | None) -> tuple[str | None, str | None]:
    if not ref_value:
        return None, None
    if "|" in ref_value:
        payout_id, bank_ref = ref_value.split("|", 1)
        return payout_id or None, bank_ref or None
    return ref_value, None


def _can_use_manual_claim_entry(current_worker: Worker) -> bool:
    # Zero-touch is the production default.
    # Manual claim creation remains available only for controlled admin QA in development.
    role = current_worker.role.value if hasattr(current_worker.role, "value") else str(current_worker.role)
    return settings.environment == "development" and role in {"admin", "superadmin"}


def build_claim_timeline(claim: Claim, worker: Worker, amount: float) -> list[dict]:
    created = claim.created_at.astimezone(timezone.utc)
    eligibility_time = created + timedelta(seconds=30)
    fraud_time = created + timedelta(seconds=60)
    payout_time = created + timedelta(seconds=90)
    transfer_time = created + timedelta(seconds=120)
    fallback_confirmed = created + timedelta(seconds=180)
    confirmed_time = claim.settled_at.astimezone(timezone.utc) if claim.settled_at else fallback_confirmed
    final_status = claim.status.value if hasattr(claim.status, "value") else str(claim.status)
    payout_ref, _bank_ref = _parse_settlement_refs(claim.upi_ref)
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
            "description": "Active policy | Warranty met | Zone confirmed",
            "timestamp": eligibility_time.isoformat(),
        },
        {
            "id": "fraud_check",
            "label": "Verification Complete",
            "description": f"ARGUS complete | score {float(claim.fraud_score or 0):.2f}",
            "timestamp": fraud_time.isoformat(),
        },
        {
            "id": "payout_calculated",
            "label": "Payout Calculated",
            "description": f"Auto-calculated payout Rs {amount:.0f}",
            "timestamp": payout_time.isoformat(),
        },
        {
            "id": "transfer_initiated",
            "label": "Transfer Initiated",
            "description": f"Settlement initiated to {worker.upi_id_decrypted or 'registered UPI'}",
            "timestamp": transfer_time.isoformat(),
        },
        {
            "id": "confirmed",
            "label": "Payment Confirmed",
            "description": f"UPI Ref: {payout_ref or 'PENDING'}",
            "timestamp": confirmed_time.isoformat(),
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

    stmt = (
        select(Claim)
        .options(selectinload(Claim.worker))
        .where(Claim.worker_id == worker_id)
        .order_by(Claim.created_at.desc())
    )
    claims = (await db.execute(stmt)).scalars().all()
    result = []
    for c in claims:
        worker = c.worker
        if worker is None:
            continue
        payout_ref, bank_ref = _parse_settlement_refs(c.upi_ref)
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
                "upi_ref": payout_ref,
                "bank_ref": bank_ref,
                "settlement_channel": "Razorpay UPI Test Mode",
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

    stmt = (
        select(Claim)
        .options(selectinload(Claim.worker))
        .where(Claim.id == claim_id, Claim.worker_id == worker_id)
    )
    claim = (await db.execute(stmt)).scalar_one_or_none()
    if not claim:
        return error_response("NOT_FOUND", "Claim not found.", status_code=404, request_id=request_id)
    if claim.worker is None:
        return error_response("NOT_FOUND", "Claim worker not found.", status_code=404, request_id=request_id)
    payout_ref, bank_ref = _parse_settlement_refs(claim.upi_ref)
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
            "timeline": build_claim_timeline(claim, claim.worker, float(claim.payout_amount)),
            "upi_ref": payout_ref,
            "bank_ref": bank_ref,
            "settlement_channel": "Razorpay UPI Test Mode",
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
    redis_client=Depends(get_redis),
    db: AsyncSession = Depends(get_db),
):
    request_id = request_id_from_request(request)
    if not _can_use_manual_claim_entry(current_worker):
        return error_response(
            "ZERO_TOUCH_ENFORCED",
            "Manual claim filing is disabled. Claims are auto-created by trigger engine only.",
            status_code=403,
            request_id=request_id,
        )

    try:
        await rate_limit(
            key=f"rate:claim:{current_worker.id}",
            max_requests=5,
            window_seconds=3600,
            redis_client=redis_client,
        )
    except RateLimitExceeded as exc:
        response = error_response(
            code="RATE_LIMITED",
            message="Too many claim submissions. Please try again later.",
            status_code=429,
            request_id=request_id,
        )
        response.headers["Retry-After"] = str(exc.retry_after_seconds)
        return response

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
        device_telemetry=payload.device_telemetry.model_dump() if payload.device_telemetry else None,
        recent_h3_pings=[ping.model_dump() for ping in payload.recent_h3_pings],
        oracle_snapshot=payload.oracle_snapshot.model_dump() if payload.oracle_snapshot else None,
    )
    if claim is None:
        return error_response("NOT_ELIGIBLE", "Worker does not have an active policy.", status_code=400, request_id=request_id)
    payout_ref, bank_ref = _parse_settlement_refs(claim.upi_ref)

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
                "upi_ref": payout_ref,
                "bank_ref": bank_ref,
                "settlement_channel": "Razorpay UPI Test Mode",
            },
        },
        request_id=request_id,
    )


@router.post("/claims")
async def create_claim_alias(
    payload: CreateClaimRequest,
    request: Request,
    current_worker: Worker = Depends(get_current_worker),
    redis_client=Depends(get_redis),
    db: AsyncSession = Depends(get_db),
):
    # Alias maintained for API-contract flexibility around /api/claims POST.
    return await create_claim(payload, request, current_worker, redis_client, db)


@router.get("/sse/claims")
async def claims_sse():
    async def event_generator():
        async for event in event_bus.subscribe("claims"):
            yield event

    return StreamingResponse(event_generator(), media_type="text/event-stream")


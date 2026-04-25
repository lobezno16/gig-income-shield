from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from models import Claim, ClaimStatus, Payout, PayoutStatus, Policy, TriggerEvent, Worker
from services.athena.premium_engine import URBAN_TIER_MULTIPLIERS
from services.hermes.upi_mock import RazorpayPayoutResult, mock_gateway_transfer

logger = structlog.get_logger("soteria.hermes.payout_service")
settings = get_settings()


@dataclass
class IdempotentPayoutResult:
    status: str
    payout_amount: float
    payout_pct_applied: float
    idempotency_key: str
    attempts: int
    upi_result: RazorpayPayoutResult | None = None
    message: str = ""


@dataclass
class PayoutContext:
    claim: Claim
    worker: Worker
    trigger: TriggerEvent
    provider: str
    payout_amount: float
    payout_pct: float
    idempotency_key: str
    payout: Payout | None = None


def encode_upi_ref(payout_id: str, bank_ref: str) -> str:
    return f"{payout_id}|{bank_ref}"


def build_idempotency_key(disruption_event_id: UUID | str, worker_id: UUID | str) -> str:
    return f"{disruption_event_id}:{worker_id}"


def payout_pct_from_fraud_status(status: str) -> float:
    if status == "blocked":
        return 0.0
    if status == "flagged":
        return 0.8
    return 1.0


def _resolve_fraud_status(claim: Claim) -> str:
    status = claim.status.value if hasattr(claim.status, "value") else str(claim.status)
    if status in {"approved", "flagged", "blocked"}:
        return status
    layers = claim.argus_layers or {}
    summary = layers.get("summary") if isinstance(layers, dict) else {}
    summary_status = summary.get("status") if isinstance(summary, dict) else None
    if isinstance(summary_status, str) and summary_status in {"approved", "flagged", "blocked"}:
        return summary_status
    return "approved"


def _compute_base_payout(claim: Claim, worker: Worker, policy: Policy) -> float:
    fixed_daily = {"zepto": 1000, "zomato": 950, "swiggy": 900, "blinkit": 980}.get(worker.platform.value, 900)
    trigger_days = 1
    urban_multiplier = URBAN_TIER_MULTIPLIERS.get(int(policy.urban_tier), 1.0)
    base_payout = fixed_daily * trigger_days * float(claim.payout_pct) * urban_multiplier
    return min(base_payout, float(policy.max_payout_week))


async def _get_existing_payout(db: AsyncSession, idempotency_key: str) -> Payout | None:
    return (
        await db.execute(select(Payout).where(Payout.idempotency_key == idempotency_key))
    ).scalar_one_or_none()


async def _call_gateway_with_retries(
    *,
    provider: str,
    upi_id: str,
    amount: float,
    claim_number: str,
    idempotency_key: str,
) -> tuple[RazorpayPayoutResult, int]:
    attempts = 0
    latest_result = RazorpayPayoutResult(
        success=False,
        provider=provider,
        timeout=True,
        error={"code": "INTERNAL_ERROR", "description": "Uninitialized gateway result"},
    )
    for backoff_seconds in (1, 2, 4):
        attempts += 1
        latest_result = await mock_gateway_transfer(
            provider=provider,
            upi_id=upi_id,
            amount=amount,
            payout_id=claim_number,
            purpose="payout",
            idempotency_key=idempotency_key,
        )
        if latest_result.success:
            return latest_result, attempts
        if not latest_result.timeout:
            return latest_result, attempts
        await asyncio.sleep(backoff_seconds)
    return latest_result, attempts


async def _handle_blocked_claim(
    claim: Claim, payout_amount: float, idempotency_key: str, db: AsyncSession
) -> IdempotentPayoutResult:
    claim.payout_amount = payout_amount
    claim.status = ClaimStatus.blocked
    claim.upi_ref = None
    claim.settled_at = None
    await db.commit()
    return IdempotentPayoutResult(
        status="blocked",
        payout_amount=payout_amount,
        payout_pct_applied=0.0,
        idempotency_key=idempotency_key,
        attempts=0,
        message="Blocked by ARGUS for admin review.",
    )


async def _handle_already_settled_payout(
    claim: Claim, payout: Payout, payout_pct: float, idempotency_key: str, db: AsyncSession
) -> IdempotentPayoutResult:
    claim.status = ClaimStatus.paid
    claim.payout_amount = float(payout.amount)
    payout_id = payout.gateway_payout_id or ""
    bank_ref = payout.gateway_bank_ref or ""
    claim.upi_ref = encode_upi_ref(payout_id, bank_ref) if payout_id and bank_ref else None
    claim.settled_at = payout.settled_at or datetime.now(timezone.utc)
    await db.commit()
    return IdempotentPayoutResult(
        status="paid",
        payout_amount=float(payout.amount),
        payout_pct_applied=payout_pct,
        idempotency_key=idempotency_key,
        attempts=int(payout.attempt_count),
        upi_result=RazorpayPayoutResult(
            success=True,
            provider=payout.provider,
            id=payout.gateway_payout_id,
            utr=payout.gateway_bank_ref,
            amount=int(round(float(payout.amount) * 100)),
            currency=payout.currency,
            status="processed",
        ),
        message="Idempotent replay: payout already settled.",
    )


async def _upsert_pending_payout(
    ctx: PayoutContext,
    db: AsyncSession,
) -> Payout:
    if ctx.payout is None:
        payout = Payout(
            claim_id=ctx.claim.id,
            worker_id=ctx.worker.id,
            trigger_id=ctx.trigger.id,
            idempotency_key=ctx.idempotency_key,
            provider=ctx.provider,
            amount=ctx.payout_amount,
            currency="INR",
            status=PayoutStatus.pending,
            attempt_count=0,
            gateway_response={},
        )
        db.add(payout)
    else:
        payout = ctx.payout
        payout.provider = ctx.provider
        payout.amount = ctx.payout_amount
        payout.currency = "INR"
        payout.status = PayoutStatus.pending
        payout.error_code = None
        payout.error_message = None

    ctx.claim.status = ClaimStatus.processing
    ctx.claim.payout_amount = ctx.payout_amount
    ctx.claim.upi_ref = None
    ctx.claim.settled_at = None
    await db.commit()
    return payout


async def _finalize_successful_payout(
    ctx: PayoutContext,
    attempts: int,
    gateway_result: RazorpayPayoutResult,
    now: datetime,
    db: AsyncSession,
) -> IdempotentPayoutResult:
    if ctx.payout is None:
        raise ValueError("Payout object must be initialized in PayoutContext for finalization.")

    ctx.payout.status = PayoutStatus.settled
    ctx.payout.gateway_payout_id = gateway_result.payout_id
    ctx.payout.gateway_bank_ref = gateway_result.bank_ref
    ctx.payout.error_code = None
    ctx.payout.error_message = None
    ctx.payout.settled_at = now

    ctx.claim.status = ClaimStatus.paid
    ctx.claim.payout_amount = ctx.payout_amount
    ctx.claim.upi_ref = encode_upi_ref(gateway_result.payout_id or "", gateway_result.bank_ref or "")
    ctx.claim.settled_at = now
    await db.commit()
    await db.refresh(ctx.claim)
    return IdempotentPayoutResult(
        status="paid",
        payout_amount=ctx.payout_amount,
        payout_pct_applied=ctx.payout_pct,
        idempotency_key=ctx.idempotency_key,
        attempts=attempts,
        upi_result=gateway_result,
        message="Settlement completed atomically.",
    )


async def _finalize_failed_payout(
    ctx: PayoutContext,
    attempts: int,
    gateway_result: RazorpayPayoutResult,
    db: AsyncSession,
) -> IdempotentPayoutResult:
    if ctx.payout is None:
        raise ValueError("Payout object must be initialized in PayoutContext for finalization.")

    ctx.payout.status = PayoutStatus.gateway_timeout if gateway_result.timeout else PayoutStatus.failed
    ctx.payout.gateway_payout_id = None
    ctx.payout.gateway_bank_ref = None
    ctx.payout.error_code = (gateway_result.error or {}).get("code")
    ctx.payout.error_message = (gateway_result.error or {}).get("description")

    ctx.claim.status = ClaimStatus.processing
    ctx.claim.payout_amount = 0
    ctx.claim.upi_ref = None
    ctx.claim.settled_at = None
    await db.commit()
    await db.refresh(ctx.claim)
    return IdempotentPayoutResult(
        status="processing",
        payout_amount=0.0,
        payout_pct_applied=ctx.payout_pct,
        idempotency_key=ctx.idempotency_key,
        attempts=attempts,
        upi_result=gateway_result,
        message="Gateway call failed; payout rolled back for safe retry.",
    )


async def execute_idempotent_settlement(
    claim: Claim,
    worker: Worker,
    trigger: TriggerEvent,
    policy: Policy,
    db: AsyncSession,
) -> IdempotentPayoutResult:
    """
    Atomic 3-step payout flow:
    1) Persist payout record in pending state (idempotency key bound to event+worker)
    2) Call payment gateway
    3) Update payout+claim to settled; on failure rollback claim to pending for safe retry
    """
    fraud_status = _resolve_fraud_status(claim)
    payout_pct = payout_pct_from_fraud_status(fraud_status)
    base_payout = _compute_base_payout(claim, worker, policy)
    payout_amount = round(base_payout * payout_pct, 2)

    idempotency_key = build_idempotency_key(trigger.id, worker.id)

    if payout_pct == 0:
        return await _handle_blocked_claim(claim, payout_amount, idempotency_key, db)

    provider = settings.payment_provider.strip().lower() if settings.payment_provider else "razorpay_test"
    if provider not in {"razorpay_test", "stripe_sandbox"}:
        provider = "razorpay_test"

    payout = await _get_existing_payout(db, idempotency_key)
    if payout and payout.status == PayoutStatus.settled:
        return await _handle_already_settled_payout(claim, payout, payout_pct, idempotency_key, db)

    ctx = PayoutContext(
        claim=claim,
        worker=worker,
        trigger=trigger,
        provider=provider,
        payout_amount=payout_amount,
        payout_pct=payout_pct,
        idempotency_key=idempotency_key,
        payout=payout,
    )

    # Step 1: create/update pending payout record and pin claim to pending(processing).
    ctx.payout = await _upsert_pending_payout(ctx, db)

    # Step 2: gateway call with deterministic idempotency key.
    gateway_result, attempts = await _call_gateway_with_retries(
        provider=ctx.provider,
        upi_id=ctx.worker.upi_id_decrypted or "",
        amount=ctx.payout_amount,
        claim_number=ctx.claim.claim_number,
        idempotency_key=ctx.idempotency_key,
    )

    now = datetime.now(timezone.utc)
    ctx.payout.attempt_count = int(ctx.payout.attempt_count or 0) + attempts
    ctx.payout.gateway_response = gateway_result.as_dict()
    ctx.payout.updated_at = now

    # Step 3: finalize or rollback claim state based on gateway response.
    if gateway_result.success:
        return await _finalize_successful_payout(ctx, attempts, gateway_result, now, db)

    return await _finalize_failed_payout(ctx, attempts, gateway_result, db)

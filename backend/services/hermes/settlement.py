from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

import structlog
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from database import AsyncSessionLocal
from events import event_bus
from models import Claim, Policy, TriggerEvent, Worker
from services.actuarial.bcr_monitor import update_bcr
from services.athena.bayesian_updater import BayesianBetaBinomial
from services.hermes.notification import send_settlement_notification
from services.hermes.payout_service import (
    IdempotentPayoutResult,
    encode_upi_ref,
    execute_idempotent_settlement,
    payout_pct_from_fraud_status,
)
from services.hermes.upi_mock import RazorpayPayoutResult

logger = structlog.get_logger("soteria.settlement")


@dataclass
class SettlementResult:
    status: str
    payout_amount: float
    payout_pct_applied: float
    upi_result: RazorpayPayoutResult | None = None
    attempts: int = 0
    message: str = ""
    idempotency_key: str | None = None


async def process_settlement(
    claim: Claim,
    worker: Worker,
    trigger: TriggerEvent,
    policy: Policy,
    db: AsyncSession,
) -> SettlementResult:
    payout_result: IdempotentPayoutResult = await execute_idempotent_settlement(
        claim=claim,
        worker=worker,
        trigger=trigger,
        policy=policy,
        db=db,
    )

    if payout_result.status == "paid" and payout_result.upi_result:
        payout_id = payout_result.upi_result.payout_id or ""
        bank_ref = payout_result.upi_result.bank_ref or ""
        claim.upi_ref = encode_upi_ref(payout_id, bank_ref) if payout_id and bank_ref else claim.upi_ref
        await db.commit()
        await send_settlement_notification(worker.phone, payout_result.payout_amount, payout_id)
        await update_bcr(policy.pool_id, db)
        bayes = BayesianBetaBinomial(db)
        await bayes.update(trigger.h3_hex, trigger.peril.value, trigger_occurred=True)
        await event_bus.publish(
            "claims",
            "claim_update",
            {
                "claim_id": str(claim.id),
                "claim_number": claim.claim_number,
                "status": "paid",
                "amount": payout_result.payout_amount,
                "upi_ref": payout_id,
                "bank_ref": bank_ref,
            },
        )
        await event_bus.publish(
            "triggers",
            "trigger_fired",
            {"trigger_id": str(trigger.id), "peril": trigger.peril.value, "h3_hex": trigger.h3_hex},
        )

    return SettlementResult(
        status=payout_result.status,
        payout_amount=payout_result.payout_amount,
        payout_pct_applied=payout_result.payout_pct_applied,
        upi_result=payout_result.upi_result,
        attempts=payout_result.attempts,
        message=payout_result.message,
        idempotency_key=payout_result.idempotency_key,
    )


async def _settle_claim_background(claim_id: str) -> None:
    """Background settlement worker. Runs retries without blocking HTTP request latency."""
    try:
        claim_uuid = UUID(claim_id)
    except ValueError:
        logger.warning("background_settlement_invalid_claim_id", claim_id=claim_id)
        return

    try:
        async with AsyncSessionLocal() as db:
            stmt = (
                select(Claim)
                .options(
                    selectinload(Claim.worker),
                    selectinload(Claim.trigger),
                    selectinload(Claim.policy),
                )
                .where(Claim.id == claim_uuid)
            )
            claim = (await db.execute(stmt)).scalars().one_or_none()
            if claim is None or claim.worker is None or claim.trigger is None or claim.policy is None:
                logger.warning("background_settlement_claim_not_found", claim_id=claim_id)
                return
            await process_settlement(claim, claim.worker, claim.trigger, claim.policy, db)
    except Exception:
        logger.exception("background_settlement_failed", claim_id=claim_id)


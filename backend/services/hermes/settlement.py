from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from events import event_bus
from models import Claim, ClaimStatus
from services.actuarial.bcr_monitor import update_bcr
from services.athena.bayesian_updater import BayesianBetaBinomial
from services.athena.premium_engine import URBAN_TIER_MULTIPLIERS
from services.hermes.notification import send_settlement_notification
from services.hermes.upi_mock import UPIResult, mock_upi_transfer


@dataclass
class SettlementResult:
    status: str
    payout_amount: float
    payout_pct_applied: float
    upi_result: UPIResult | None = None
    attempts: int = 0
    message: str = ""


def payout_pct_from_fraud_status(status: str) -> float:
    if status == "blocked":
        return 0.0
    if status == "flagged":
        return 0.8
    return 1.0


async def process_settlement(claim: Claim, worker, trigger, policy, db: AsyncSession) -> SettlementResult:
    fixed_daily = {"zepto": 1000, "zomato": 950, "swiggy": 900, "blinkit": 980}[worker.platform.value]
    trigger_days = 1
    urban_multiplier = URBAN_TIER_MULTIPLIERS.get(int(policy.urban_tier), 1.0)
    base_payout = fixed_daily * trigger_days * float(claim.payout_pct) * urban_multiplier

    fraud_status = claim.status.value if hasattr(claim.status, "value") else str(claim.status)
    payout_multiplier = payout_pct_from_fraud_status(fraud_status)
    payout_amount = round(base_payout * payout_multiplier, 2)

    if payout_multiplier == 0:
        claim.payout_amount = payout_amount
        claim.status = ClaimStatus.blocked
        await db.commit()
        return SettlementResult(
            status="blocked",
            payout_amount=payout_amount,
            payout_pct_applied=0.0,
            message="Blocked by ARGUS for admin review.",
        )

    attempt = 0
    transfer_result: UPIResult | None = None
    for sleep_seconds in [1, 2, 4]:
        attempt += 1
        transfer_result = await mock_upi_transfer(worker.upi_id or "", payout_amount)
        if transfer_result.success:
            break
        await asyncio.sleep(sleep_seconds)
    if transfer_result is None:
        transfer_result = UPIResult(success=False, error="UNKNOWN")

    claim.payout_amount = payout_amount
    claim.upi_ref = transfer_result.ref_id if transfer_result.success else None
    if transfer_result.success:
        claim.status = ClaimStatus.paid
        claim.settled_at = datetime.now(timezone.utc)
    else:
        claim.status = ClaimStatus.processing

    await db.commit()
    await db.refresh(claim)

    if transfer_result.success:
        await send_settlement_notification(worker.phone, payout_amount, transfer_result.ref_id or "")
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
                "amount": payout_amount,
                "upi_ref": claim.upi_ref,
            },
        )
        await event_bus.publish(
            "triggers",
            "trigger_fired",
            {"trigger_id": str(trigger.id), "peril": trigger.peril.value, "h3_hex": trigger.h3_hex},
        )

    return SettlementResult(
        status="paid" if transfer_result.success else "processing",
        payout_amount=payout_amount,
        payout_pct_applied=payout_multiplier,
        upi_result=transfer_result,
        attempts=attempt,
        message="Settlement completed." if transfer_result.success else "UPI transfer pending after retries.",
    )


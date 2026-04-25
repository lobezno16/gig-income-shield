from __future__ import annotations

import asyncio
import secrets
import string
import time
from dataclasses import dataclass
from typing import Any

_IDEMPOTENCY_CACHE: dict[str, "RazorpayPayoutResult"] = {}


def _random_token(length: int) -> str:
    alphabet = string.ascii_lowercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


@dataclass
class RazorpayPayoutResult:
    success: bool
    provider: str = "razorpay_test"
    id: str | None = None
    entity: str | None = None
    fund_account_id: str | None = None
    amount: int | None = None
    currency: str | None = None
    fees: int | None = None
    tax: int | None = None
    status: str | None = None
    utr: str | None = None
    mode: str | None = None
    purpose: str | None = None
    created_at: int | None = None
    error: dict[str, str] | None = None
    timeout: bool = False

    @property
    def payout_id(self) -> str | None:
        return self.id

    @property
    def bank_ref(self) -> str | None:
        return self.utr

    def as_dict(self) -> dict[str, Any]:
        if self.success:
            return {
                "provider": self.provider,
                "id": self.id,
                "entity": self.entity,
                "fund_account_id": self.fund_account_id,
                "amount": self.amount,
                "currency": self.currency,
                "fees": self.fees,
                "tax": self.tax,
                "status": self.status,
                "utr": self.utr,
                "mode": self.mode,
                "purpose": self.purpose,
                "created_at": self.created_at,
                "timeout": False,
            }
        return {
            "provider": self.provider,
            "timeout": self.timeout,
            "error": self.error
            or {
                "code": "BAD_REQUEST_ERROR",
                "description": "Gateway timeout",
            },
        }


def _build_success_result(
    provider: str,
    amount: float,
    purpose: str,
) -> RazorpayPayoutResult:
    gateway_prefix = "strp" if provider == "stripe_sandbox" else "pout"
    bank_prefix = "ICIC" if provider == "stripe_sandbox" else "HDFC"
    return RazorpayPayoutResult(
        success=True,
        provider=provider,
        id=f"{gateway_prefix}_{_random_token(14)}",
        entity="payout",
        fund_account_id=f"fa_{_random_token(12)}",
        amount=int(round(amount * 100)),
        currency="INR",
        fees=0,
        tax=0,
        status="processed",
        utr=f"{bank_prefix}{secrets.SystemRandom().randint(10000000, 99999999)}",
        mode="UPI",
        purpose=purpose,
        created_at=int(time.time()),
    )


def _build_error_result(provider: str, timeout: bool) -> RazorpayPayoutResult:
    code = "GATEWAY_TIMEOUT" if timeout else "BAD_REQUEST_ERROR"
    description = "Network timeout from gateway" if timeout else "Gateway rejected request"
    return RazorpayPayoutResult(
        success=False,
        provider=provider,
        timeout=timeout,
        error={"code": code, "description": description},
    )


async def mock_gateway_transfer(
    *,
    provider: str,
    upi_id: str,
    amount: float,
    payout_id: str,
    purpose: str,
    idempotency_key: str,
) -> RazorpayPayoutResult:
    _ = (upi_id, payout_id)
    if idempotency_key in _IDEMPOTENCY_CACHE:
        return _IDEMPOTENCY_CACHE[idempotency_key]

    rng = secrets.SystemRandom()
    await asyncio.sleep(rng.uniform(0.6, 1.8))
    roll = rng.random()
    if roll < 0.95:
        result = _build_success_result(provider, amount, purpose)
        _IDEMPOTENCY_CACHE[idempotency_key] = result
        return result
    if roll < 0.985:
        return _build_error_result(provider, timeout=True)
    return _build_error_result(provider, timeout=False)


async def mock_upi_transfer(
    upi_id: str,
    amount: float,
    payout_id: str,
    purpose: str,
    idempotency_key: str | None = None,
) -> RazorpayPayoutResult:
    key = idempotency_key or f"legacy:{payout_id}:{amount:.2f}"
    return await mock_gateway_transfer(
        provider="razorpay_test",
        upi_id=upi_id,
        amount=amount,
        payout_id=payout_id,
        purpose=purpose,
        idempotency_key=key,
    )

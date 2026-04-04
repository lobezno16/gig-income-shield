from __future__ import annotations

import asyncio
import random
from dataclasses import dataclass


@dataclass
class UPIResult:
    success: bool
    ref_id: str | None = None
    bank_ref: str | None = None
    error: str | None = None


async def mock_upi_transfer(upi_id: str, amount: float) -> UPIResult:
    _ = (upi_id, amount)
    await asyncio.sleep(random.uniform(0.8, 2.4))
    success_rate = 0.97
    if random.random() < success_rate:
        return UPIResult(
            success=True,
            ref_id=f"UPI{random.randint(100000000000, 999999999999)}",
            bank_ref=f"HDFC{random.randint(10000000, 99999999)}",
        )
    return UPIResult(success=False, error="BANK_TIMEOUT")


from __future__ import annotations

from datetime import date, timedelta

import numpy as np
from fastapi import APIRouter, Depends, Request
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from constants import H3_ZONES
from database import get_db
from models import BCRRecord, H3RiskProfile, Policy
from response import request_id_from_request, success_response

router = APIRouter(prefix="/api", tags=["zones", "liquidity"])


@router.get("/zones/heatmap")
async def heatmap(request: Request, db: AsyncSession = Depends(get_db)):
    request_id = request_id_from_request(request)
    profiles = (await db.execute(select(H3RiskProfile))).scalars().all()
    if profiles:
        data = [
            {
                "h3_hex": p.h3_hex,
                "peril": p.peril,
                "city": p.city,
                "pool_id": p.pool_id,
                "urban_tier": p.urban_tier,
                "trigger_prob": float(p.trigger_prob_p50 or 0),
                "trigger_prob_p10": float(p.trigger_prob_p10 or 0),
                "trigger_prob_p90": float(p.trigger_prob_p90 or 0),
                "active_workers": int(120 + (float(p.trigger_prob_p50 or 0.1) * 300)),
                "recent_claims": int(5 + float(p.trigger_prob_p50 or 0.1) * 20),
            }
            for p in profiles
        ]
    else:
        data = [
            {
                "h3_hex": h3_hex,
                "peril": "rain",
                "city": z["city"],
                "pool_id": z["pool"],
                "urban_tier": z["urban_tier"],
                "trigger_prob": 0.12,
                "trigger_prob_p10": 0.08,
                "trigger_prob_p90": 0.19,
                "active_workers": 150,
                "recent_claims": 12,
            }
            for h3_hex, z in H3_ZONES.items()
        ]
    return success_response({"hexes": data}, request_id=request_id)


@router.get("/liquidity/forecast")
async def liquidity_forecast(request: Request, db: AsyncSession = Depends(get_db)):
    request_id = request_id_from_request(request)
    records = (await db.execute(select(BCRRecord).order_by(desc(BCRRecord.period_end)).limit(12))).scalars().all()
    if records:
        records = list(reversed(records))
        x = np.arange(len(records))
        y_claims = np.array([float(r.total_claims) for r in records])
        y_premiums = np.array([float(r.total_premiums) for r in records])
        claim_slope, claim_intercept = np.polyfit(x, y_claims, deg=1)
        premium_slope, premium_intercept = np.polyfit(x, y_premiums, deg=1)
        future = []
        for i in range(1, 9):
            idx = len(records) + i
            projected_claims = max(0.0, float(claim_intercept + claim_slope * idx))
            projected_premiums = max(1.0, float(premium_intercept + premium_slope * idx))
            future.append(
                {
                    "week": i,
                    "projected_claims": round(projected_claims, 2),
                    "projected_premiums": round(projected_premiums, 2),
                    "projected_bcr": round(projected_claims / projected_premiums, 4),
                }
            )
    else:
        future = [
            {"week": i, "projected_claims": 1_200_000 + i * 45_000, "projected_premiums": 1_900_000 + i * 25_000, "projected_bcr": 0.63 + i * 0.02}
            for i in range(1, 9)
        ]
    return success_response({"forecast": future}, request_id=request_id)


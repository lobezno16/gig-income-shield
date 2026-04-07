from __future__ import annotations

from datetime import datetime

import h3
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from events import event_bus
from models import TriggerEvent, Worker
from response import error_response, request_id_from_request, success_response
from services.claims_orchestrator import orchestrate_claim_for_worker
from services.sentinelle.data_sources import classify_trigger_level
from services.sentinelle.trigger_processor import create_trigger_event

router = APIRouter(prefix="/api", tags=["triggers"])


class TriggerWebhookPayload(BaseModel):
    peril: str
    source: str
    reading_value: float
    city: str
    h3_hex: str
    triggered_at: datetime | None = None


class TriggerSimulationPayload(BaseModel):
    peril: str = Field(default="aqi")
    reading_value: float = Field(default=380)
    city: str = Field(default="delhi")
    h3_hex: str = Field(default="872a1072bffffff")
    source: str = Field(default="simulation")


async def auto_process_trigger_claims(db: AsyncSession, event: TriggerEvent, max_workers: int = 40) -> dict:
    try:
        center_lat, center_lng = h3.cell_to_latlng(event.h3_hex)
    except Exception:
        center_lat, center_lng = (28.6139, 77.2090)

    workers = (
        await db.execute(
            select(Worker).where(Worker.h3_hex == event.h3_hex, Worker.is_active.is_(True)).order_by(Worker.created_at.desc()).limit(max_workers)
        )
    ).scalars().all()

    claims_created = 0
    paid = 0
    blocked = 0
    total_payout = 0.0
    for worker in workers:
        claim, settlement = await orchestrate_claim_for_worker(
            db,
            worker=worker,
            trigger=event,
            gps_lat=center_lat,
            gps_lng=center_lng,
            platform_active_at_trigger=True,
            timestamp=datetime.utcnow(),
            typical_shift_start=8,
            typical_shift_end=23,
        )
        if claim is None:
            continue
        claims_created += 1
        total_payout += float(claim.payout_amount)
        if claim.status.value == "paid":
            paid += 1
        if claim.status.value == "blocked":
            blocked += 1

    event.total_payout_inr = total_payout
    await db.commit()
    await db.refresh(event)
    return {
        "claims_created": claims_created,
        "paid": paid,
        "blocked": blocked,
        "total_payout_inr": round(total_payout, 2),
    }


@router.post("/webhooks/disruption")
async def disruption_webhook(payload: TriggerWebhookPayload, request: Request, db: AsyncSession = Depends(get_db)):
    request_id = request_id_from_request(request)
    level = classify_trigger_level(payload.peril, payload.reading_value)
    if not level:
        return error_response("NO_TRIGGER", "Reading did not cross threshold.", status_code=200, request_id=request_id)
    trigger_level, payout_pct = level
    event = await create_trigger_event(
        db,
        peril=payload.peril,
        source=payload.source,
        city=payload.city,
        h3_hex=payload.h3_hex,
        reading_value=payload.reading_value,
        trigger_level=trigger_level,
        payout_pct=payout_pct,
    )
    claim_summary = await auto_process_trigger_claims(db, event)
    return success_response(
        {
            "trigger_id": str(event.id),
            "peril": event.peril.value,
            "trigger_level": event.trigger_level,
            "payout_pct": float(event.payout_pct),
            "workers_affected": event.workers_affected,
            "claims_created": claim_summary["claims_created"],
            "claims_paid": claim_summary["paid"],
            "claims_blocked": claim_summary["blocked"],
            "total_payout_inr": claim_summary["total_payout_inr"],
            "claims": claim_summary,
        },
        request_id=request_id,
    )


@router.get("/triggers/recent")
async def recent_triggers(request: Request, db: AsyncSession = Depends(get_db)):
    request_id = request_id_from_request(request)
    stmt = select(TriggerEvent).order_by(desc(TriggerEvent.triggered_at)).limit(10)
    events = (await db.execute(stmt)).scalars().all()
    return success_response(
        {
            "items": [
                {
                    "id": str(e.id),
                    "peril": e.peril.value,
                    "source": e.source,
                    "reading_value": float(e.reading_value),
                    "trigger_level": e.trigger_level,
                    "payout_pct": float(e.payout_pct),
                    "city": e.city,
                    "h3_hex": e.h3_hex,
                    "workers_affected": e.workers_affected,
                    "total_payout_inr": float(e.total_payout_inr),
                    "triggered_at": e.triggered_at.isoformat(),
                }
                for e in events
            ]
        },
        request_id=request_id,
    )


@router.post("/triggers/simulate")
async def simulate_trigger(payload: TriggerSimulationPayload, request: Request, db: AsyncSession = Depends(get_db)):
    request_id = request_id_from_request(request)
    level = classify_trigger_level(payload.peril, payload.reading_value)
    if not level:
        return error_response("NO_TRIGGER", "Simulation reading below threshold.", status_code=400, request_id=request_id)
    trigger_level, payout_pct = level
    event = await create_trigger_event(
        db,
        peril=payload.peril,
        source=payload.source,
        city=payload.city,
        h3_hex=payload.h3_hex,
        reading_value=payload.reading_value,
        trigger_level=trigger_level,
        payout_pct=payout_pct,
    )
    claim_summary = await auto_process_trigger_claims(db, event)
    await event_bus.publish(
        "claims",
        "trigger_fired",
        {
            "id": str(event.id),
            "label": f"{payload.peril.upper()} trigger in {payload.city}",
            "reading": payload.reading_value,
            "h3_hex": payload.h3_hex,
            "payout_pct": payout_pct,
            "claims_created": claim_summary["claims_created"],
        },
    )
    return success_response(
        {
            "simulated": True,
            "trigger_id": str(event.id),
            "claims_created": claim_summary["claims_created"],
            "claims_paid": claim_summary["paid"],
            "claims_blocked": claim_summary["blocked"],
            "total_payout_inr": claim_summary["total_payout_inr"],
            "claims": claim_summary,
        },
        request_id=request_id,
    )


@router.get("/sse/triggers")
async def trigger_sse():
    async def event_generator():
        async for event in event_bus.subscribe("triggers"):
            yield event

    return StreamingResponse(event_generator(), media_type="text/event-stream")

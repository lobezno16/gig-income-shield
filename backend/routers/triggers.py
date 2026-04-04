from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from events import event_bus
from models import TriggerEvent
from response import error_response, request_id_from_request, success_response
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
    return success_response(
        {
            "trigger_id": str(event.id),
            "peril": event.peril.value,
            "trigger_level": event.trigger_level,
            "payout_pct": float(event.payout_pct),
            "workers_affected": event.workers_affected,
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
    await event_bus.publish(
        "claims",
        "trigger_fired",
        {
            "id": str(event.id),
            "label": f"{payload.peril.upper()} trigger in {payload.city}",
            "reading": payload.reading_value,
            "h3_hex": payload.h3_hex,
            "payout_pct": payout_pct,
        },
    )
    return success_response({"simulated": True, "trigger_id": str(event.id)}, request_id=request_id)


@router.get("/sse/triggers")
async def trigger_sse():
    async def event_generator():
        async for event in event_bus.subscribe("triggers"):
            yield event

    return StreamingResponse(event_generator(), media_type="text/event-stream")


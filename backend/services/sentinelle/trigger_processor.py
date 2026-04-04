from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from events import event_bus
from models import PerilType, TriggerEvent, Worker


async def create_trigger_event(
    db: AsyncSession,
    *,
    peril: str,
    source: str,
    city: str,
    h3_hex: str,
    reading_value: float,
    trigger_level: int,
    payout_pct: float,
) -> TriggerEvent:
    workers_stmt = select(func.count(Worker.id)).where(Worker.h3_hex == h3_hex, Worker.is_active.is_(True))
    workers_affected = int((await db.execute(workers_stmt)).scalar_one())
    event = TriggerEvent(
        peril=PerilType(peril),
        source=source,
        reading_value=reading_value,
        trigger_level=trigger_level,
        payout_pct=payout_pct,
        city=city,
        h3_hex=h3_hex,
        workers_affected=workers_affected,
        total_payout_inr=0,
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)

    await event_bus.publish(
        "triggers",
        "trigger_fired",
        {
            "id": str(event.id),
            "peril": peril,
            "source": source,
            "reading_value": reading_value,
            "trigger_level": trigger_level,
            "payout_pct": payout_pct,
            "city": city,
            "h3_hex": h3_hex,
            "workers_affected": workers_affected,
        },
    )
    return event

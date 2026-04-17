from __future__ import annotations

import h3
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from constants import is_supported_parametric_peril
from events import event_bus
from models import PerilType, TriggerEvent, Worker
from services.sentinelle.data_sources import normalize_h3_resolution9


def _worker_hex_matches_trigger(worker_hex: str, trigger_hex_res9: str) -> bool:
    try:
        worker_res = int(h3.get_resolution(worker_hex))
    except Exception:
        return False
    trigger_hex = normalize_h3_resolution9(trigger_hex_res9)
    try:
        if worker_res == 9:
            return worker_hex == trigger_hex
        if worker_res < 9:
            return trigger_hex in set(h3.cell_to_children(worker_hex, 9))
        return h3.cell_to_parent(worker_hex, 9) == trigger_hex
    except Exception:
        return False


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
    if not is_supported_parametric_peril(peril):
        raise ValueError(f"Unsupported peril '{peril}'. Allowed: rain, curfew, aqi.")

    city_norm = city.strip().lower()
    normalized_hex = normalize_h3_resolution9(h3_hex)
    workers = (
        await db.execute(
            select(Worker.h3_hex).where(Worker.city == city_norm, Worker.is_active.is_(True))
        )
    ).all()
    workers_affected = sum(1 for (worker_hex,) in workers if _worker_hex_matches_trigger(worker_hex, normalized_hex))
    event = TriggerEvent(
        peril=PerilType(peril),
        source=source,
        reading_value=reading_value,
        trigger_level=trigger_level,
        payout_pct=payout_pct,
        city=city_norm,
        h3_hex=normalized_hex,
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
            "city": city_norm,
            "h3_hex": h3_hex,
            "workers_affected": workers_affected,
        },
    )
    return event

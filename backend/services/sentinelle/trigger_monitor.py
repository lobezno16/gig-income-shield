from __future__ import annotations

from datetime import datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy.ext.asyncio import async_sessionmaker

from database import AsyncSessionLocal
from services.sentinelle.data_sources import classify_trigger_level, generate_mock_readings
from services.sentinelle.trigger_processor import create_trigger_event


class TriggerMonitor:
    def __init__(self, session_factory: async_sessionmaker = AsyncSessionLocal) -> None:
        self.session_factory = session_factory
        self.scheduler = AsyncIOScheduler()
        self.started = False

    def start(self) -> None:
        if self.started:
            return
        self.scheduler.add_job(self.poll, "interval", minutes=15, id="sentinelle_poll")
        self.scheduler.start()
        self.started = True

    async def poll(self) -> None:
        now = datetime.now()
        readings = generate_mock_readings(now)
        async with self.session_factory() as db:
            for reading in readings:
                level = classify_trigger_level(reading.peril, reading.reading_value)
                if not level:
                    continue
                trigger_level, payout_pct = level
                await create_trigger_event(
                    db,
                    peril=reading.peril,
                    source=reading.source,
                    city=reading.city,
                    h3_hex=reading.h3_hex,
                    reading_value=reading.reading_value,
                    trigger_level=trigger_level,
                    payout_pct=payout_pct,
                )


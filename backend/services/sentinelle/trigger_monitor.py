from __future__ import annotations

from datetime import datetime, timezone

import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy.ext.asyncio import async_sessionmaker

from config import get_settings
from database import AsyncSessionLocal
from services.renewal.weekly_renewal import run_weekly_renewal
from services.sentinelle.data_sources import classify_trigger_level, generate_mock_readings, generate_real_readings
from services.sentinelle.trigger_processor import create_trigger_event

logger = structlog.get_logger("soteria.trigger_monitor")


class TriggerMonitor:
    def __init__(self, session_factory: async_sessionmaker = AsyncSessionLocal) -> None:
        self.session_factory = session_factory
        self.settings = get_settings()
        self.scheduler = AsyncIOScheduler()
        self.started = False

    def start(self) -> None:
        if self.started:
            return
        interval_minutes = 20 if self.settings.has_real_weather_data else 15
        self.scheduler.add_job(self.poll, "interval", minutes=interval_minutes, id="sentinelle_poll")
        self.scheduler.add_job(
            run_weekly_renewal,
            trigger="cron",
            day_of_week="sun",
            hour=17,
            minute=30,
            timezone=timezone.utc,
            id="weekly_renewal",
            replace_existing=True,
            misfire_grace_time=7200,
        )
        self.scheduler.start()
        self.started = True
        logger.info(
            "trigger_monitor_started",
            poll_interval_minutes=interval_minutes,
            real_weather_data=self.settings.has_real_weather_data,
        )

    def stop(self) -> None:
        if not self.started:
            return
        self.scheduler.shutdown(wait=False)
        self.started = False
        logger.info("trigger_monitor_stopped")

    async def poll(self) -> None:
        now = datetime.now(timezone.utc)
        try:
            readings = await generate_real_readings(now)
        except Exception as exc:
            logger.warning("trigger_poll_readings_failed", error=str(exc))
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


trigger_monitor = TriggerMonitor()

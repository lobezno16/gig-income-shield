from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import h3
import httpx
import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from config import get_settings
from database import AsyncSessionLocal
from models import PerilType, Policy, PolicyStatus, TriggerEvent, Worker
from services.claims_orchestrator import orchestrate_claim_for_worker
from services.renewal.weekly_renewal import run_weekly_renewal
from services.sentinelle.data_sources import (
    MultiOracleSnapshot,
    TriggerCandidate,
    derive_trigger_candidates,
    generate_multi_oracle_snapshots,
    normalize_h3_resolution9,
)
from services.sentinelle.trigger_processor import create_trigger_event

logger = structlog.get_logger("soteria.trigger_cron")


@dataclass(slots=True)
class TriggerClaimSummary:
    scanned_policies: int = 0
    eligible_workers: int = 0
    claims_created: int = 0
    claims_blocked: int = 0
    claims_flagged: int = 0
    claims_approved: int = 0
    total_payout_inr: float = 0.0


def is_hour_in_active_window(hour_24: int, shift_start_hour: int, shift_end_hour: int) -> bool:
    if shift_start_hour <= shift_end_hour:
        return shift_start_hour <= hour_24 <= shift_end_hour
    return hour_24 >= shift_start_hour or hour_24 <= shift_end_hour


def _worker_hex_matches_trigger(worker_hex: str, trigger_hex_res9: str) -> bool:
    try:
        worker_res = int(h3.get_resolution(worker_hex))
    except Exception:
        return False

    try:
        trigger_hex = normalize_h3_resolution9(trigger_hex_res9)
        if worker_res == 9:
            return worker_hex == trigger_hex
        if worker_res < 9:
            return trigger_hex in set(h3.cell_to_children(worker_hex, 9))
        return h3.cell_to_parent(worker_hex, 9) == trigger_hex
    except Exception:
        return False


def _snapshot_for_event(event: TriggerEvent) -> MultiOracleSnapshot:
    default_condition = "unknown"
    if event.peril.value == "rain":
        default_condition = "heavy rain"
    elif event.peril.value == "aqi":
        default_condition = "hazardous"
    elif event.peril.value == "curfew":
        default_condition = "roadblock"
    return MultiOracleSnapshot(
        city=event.city,
        h3_hex=normalize_h3_resolution9(event.h3_hex),
        weather_condition=default_condition,
        rain_mm_per_hr=float(event.reading_value) if event.peril.value == "rain" else 0.0,
        traffic_condition=default_condition if event.peril.value == "curfew" else "unknown",
        traffic_avg_speed_kmh=0.0,
        traffic_delay_min_per_km=float(event.reading_value) if event.peril.value == "curfew" else 0.0,
        aqi=float(event.reading_value) if event.peril.value == "aqi" else 0.0,
        weather_source=event.source,
        traffic_source=event.source,
        aqi_source=event.source,
    )


async def process_trigger_event_claims(
    db: AsyncSession,
    event: TriggerEvent,
    *,
    snapshot: MultiOracleSnapshot | None = None,
    max_policies: int = 1000,
) -> TriggerClaimSummary:
    """
    Processes active weekly policies intersecting the triggered H3 cell.
    The final eligibility gate enforces worker active-hour windows.
    """
    now = event.triggered_at or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    else:
        now = now.astimezone(timezone.utc)
    snapshot = snapshot or _snapshot_for_event(event)
    trigger_hex_res9 = normalize_h3_resolution9(event.h3_hex)
    event.h3_hex = trigger_hex_res9

    policy_rows = (
        await db.execute(
            select(Policy, Worker)
            .join(Worker, Policy.worker_id == Worker.id)
            .where(
                Policy.status == PolicyStatus.active,
                Worker.is_active.is_(True),
                Policy.warranty_met.is_(True),
                Worker.city == event.city,
                or_(Policy.expires_at.is_(None), Policy.expires_at >= now),
            )
            .order_by(Policy.created_at.desc())
            .limit(max_policies)
        )
    ).all()

    summary = TriggerClaimSummary(scanned_policies=len(policy_rows))
    try:
        center_lat, center_lng = h3.cell_to_latlng(trigger_hex_res9)
    except Exception:
        center_lat, center_lng = (28.6139, 77.2090)

    for policy, worker in policy_rows:
        if event.peril.value not in (policy.coverage_perils or []):
            continue
        if not _worker_hex_matches_trigger(worker.h3_hex, trigger_hex_res9):
            continue

        shift_start = int(getattr(worker, "shift_start_hour", 8))
        shift_end = int(getattr(worker, "shift_end_hour", 23))
        if not is_hour_in_active_window(now.hour, shift_start, shift_end):
            continue

        summary.eligible_workers += 1
        claim, _settlement = await orchestrate_claim_for_worker(
            db,
            worker=worker,
            trigger=event,
            gps_lat=center_lat,
            gps_lng=center_lng,
            platform_active_at_trigger=True,
            timestamp=now,
            typical_shift_start=shift_start,
            typical_shift_end=shift_end,
            oracle_snapshot=snapshot.oracle_snapshot_payload(),
        )
        if claim is None:
            continue

        summary.claims_created += 1
        claim_status = claim.status.value if hasattr(claim.status, "value") else str(claim.status)
        if claim_status == "blocked":
            summary.claims_blocked += 1
        elif claim_status == "flagged":
            summary.claims_flagged += 1
        elif claim_status == "approved":
            summary.claims_approved += 1
        summary.total_payout_inr += float(claim.payout_amount or 0)

    event.total_payout_inr = round(summary.total_payout_inr, 2)
    await db.commit()
    await db.refresh(event)
    return summary


class MultiOracleTriggerEngine:
    def __init__(self, session_factory: async_sessionmaker = AsyncSessionLocal) -> None:
        self.session_factory = session_factory
        self.settings = get_settings()
        self.scheduler = AsyncIOScheduler()
        self.started = False
        self._client: httpx.AsyncClient | None = None

    def start(self) -> None:
        if self.started:
            return
        self.scheduler.add_job(
            self.poll,
            "interval",
            minutes=self.settings.trigger_poll_interval_minutes,
            id="sentinelle_multi_oracle_poll",
            max_instances=1,
            coalesce=True,
            misfire_grace_time=120,
        )
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
            "trigger_cron_started",
            poll_interval_minutes=self.settings.trigger_poll_interval_minutes,
            real_weather=self.settings.has_real_weather_data,
            real_traffic=self.settings.has_real_traffic_data,
            real_aqi=self.settings.has_real_aqi_data,
        )

    def stop(self) -> None:
        if not self.started:
            return
        self.scheduler.shutdown(wait=False)
        if self._client:
            asyncio.create_task(self._client.aclose())
            self._client = None
        self.started = False
        logger.info("trigger_cron_stopped")

    async def _is_recent_duplicate(self, db: AsyncSession, candidate: TriggerCandidate, now: datetime) -> bool:
        try:
            peril_enum = PerilType(candidate.peril)
        except ValueError:
            return True

        lookback = now - timedelta(minutes=self.settings.trigger_dedupe_minutes)
        existing = (
            await db.execute(
                select(TriggerEvent.id).where(
                    TriggerEvent.peril == peril_enum,
                    TriggerEvent.h3_hex == candidate.h3_hex,
                    TriggerEvent.source == candidate.source,
                    TriggerEvent.triggered_at >= lookback,
                )
            )
        ).scalar_one_or_none()
        return existing is not None

    async def poll(self) -> None:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=10.0)

        now = datetime.now(timezone.utc)
        snapshots = await generate_multi_oracle_snapshots(now, client=self._client)
        if not snapshots:
            logger.info("multi_oracle_poll_empty")
            return

        created_events = 0
        processed_claims = 0
        async with self.session_factory() as db:
            for snapshot in snapshots:
                candidates = derive_trigger_candidates(snapshot)
                for candidate in candidates:
                    if await self._is_recent_duplicate(db, candidate, now):
                        continue

                    event = await create_trigger_event(
                        db,
                        peril=candidate.peril,
                        source=candidate.source,
                        city=candidate.city,
                        h3_hex=normalize_h3_resolution9(candidate.h3_hex),
                        reading_value=candidate.reading_value,
                        trigger_level=candidate.trigger_level,
                        payout_pct=candidate.payout_pct,
                    )
                    summary = await process_trigger_event_claims(
                        db,
                        event,
                        snapshot=snapshot,
                    )
                    created_events += 1
                    processed_claims += summary.claims_created

        logger.info(
            "multi_oracle_poll_completed",
            snapshots=len(snapshots),
            events_created=created_events,
            claims_created=processed_claims,
        )

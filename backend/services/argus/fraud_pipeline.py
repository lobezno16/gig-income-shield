from __future__ import annotations

from datetime import datetime, timedelta, timezone
from dataclasses import asdict, dataclass

import h3
import structlog
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Claim, ClaimStatus, TriggerEvent, Worker
from services.argus.layer0_rules import Layer0ClaimData, layer0_rules
from services.argus.layer1_trust import SignalData, layer1_trust_score
from services.argus.layer2_isolation import IsolationFeatures, IsolationLayer
from services.argus.layer3_dbscan import RingContext, layer3_dbscan_and_zscore

logger = structlog.get_logger("soteria.argus")


@dataclass
class FraudResult:
    status: str
    combined_score: float
    trust_score: float
    isolation_score: float
    z_score: float
    ring_flag: int
    fraud_flags: list[str]
    layers: dict


def combine_fraud_scores(trust: float, isolation: float, z_score: float, ring_flag: float) -> float:
    return (1 - trust) * 0.30 + isolation * 0.25 + z_score * 0.25 + ring_flag * 0.20


def _as_aware_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _days_since_registration(created_at: datetime, now: datetime) -> int:
    return max(0, (now - _as_aware_utc(created_at)).days)


def _gps_zone_match_score(claim_hex: str, worker_hex: str) -> float:
    if claim_hex == worker_hex:
        return 1.0
    try:
        return 0.6 if h3.grid_distance(claim_hex, worker_hex) <= 1 else 0.2
    except Exception:
        return 0.2


def _build_signal_data(worker: Worker, claim_data: Layer0ClaimData, now: datetime) -> SignalData:
    claim_hex = h3.latlng_to_cell(claim_data.gps_lat, claim_data.gps_lng, 7)
    gps_zone_match = _gps_zone_match_score(claim_hex, worker.h3_hex)
    platform_activity = 1.0 if claim_data.platform_active_at_trigger else 0.0
    days_since_reg = _days_since_registration(worker.created_at, now)
    tenure_score = min(1.0, days_since_reg / 180)
    hour = claim_data.timestamp.hour
    in_shift = claim_data.typical_shift_start <= hour <= claim_data.typical_shift_end
    shift_score = 1.0 if in_shift else 0.3

    return SignalData(
        cell_tower_match=gps_zone_match,
        gps_accuracy_meters=0.0,
        motion_score=platform_activity,
        wifi_score=tenure_score,
        battery_drain_score=1.0,
        network_quality_score=shift_score,
        platform_status_score=platform_activity,
    )


async def _build_isolation_features(
    db: AsyncSession,
    worker: Worker,
    trigger: TriggerEvent,
    now: datetime,
) -> tuple[IsolationFeatures, float]:
    thirty_days_ago = now - timedelta(days=30)
    one_day_ago = now - timedelta(hours=24)

    recent_claims = (
        await db.execute(
            select(func.count(Claim.id)).where(
                Claim.worker_id == worker.id,
                Claim.created_at >= thirty_days_ago,
            )
        )
    ).scalar_one()

    avg_payout_result = (
        await db.execute(
            select(func.coalesce(func.avg(Claim.payout_amount), 0)).where(
                Claim.worker_id == worker.id,
                Claim.status == ClaimStatus.paid,
            )
        )
    ).scalar_one()

    hex_claims_24h = (
        await db.execute(
            select(func.count(Claim.id))
            .join(Claim.trigger)
            .where(
                TriggerEvent.h3_hex == trigger.h3_hex,
                Claim.created_at >= one_day_ago,
            )
        )
    ).scalar_one()

    workers_in_hex = (
        await db.execute(
            select(func.count(Worker.id)).where(Worker.h3_hex == trigger.h3_hex)
        )
    ).scalar_one()

    neighbor_ratio = float(hex_claims_24h) / max(int(workers_in_hex), 1)
    days_since_reg = _days_since_registration(worker.created_at, now)
    return (
        IsolationFeatures(
            claim_freq_30d=float(recent_claims),
            avg_payout=float(avg_payout_result),
            gps_variance=0.0,
            login_duration_min=0.0,
            days_since_reg=float(days_since_reg),
            neighbor_claim_ratio=float(neighbor_ratio),
        ),
        float(neighbor_ratio),
    )


async def _build_ring_context(
    db: AsyncSession,
    worker: Worker,
    neighbor_ratio: float,
    now: datetime,
) -> RingContext:
    worker_total_claims = (
        await db.execute(
            select(func.count(Claim.id)).where(Claim.worker_id == worker.id)
        )
    ).scalar_one()
    days_active = max(1, _days_since_registration(worker.created_at, now))
    worker_claim_rate = float(worker_total_claims) / float(days_active)

    all_hex_workers = (
        await db.execute(
            select(Worker.id).where(Worker.h3_hex == worker.h3_hex)
        )
    ).scalars().all()

    if all_hex_workers:
        hex_total_claims = (
            await db.execute(
                select(func.count(Claim.id)).where(Claim.worker_id.in_(all_hex_workers))
            )
        ).scalar_one()
    else:
        hex_total_claims = 0

    hex_worker_count = max(len(all_hex_workers), 1)
    hex_mean_rate = (float(hex_total_claims) / float(hex_worker_count)) / float(days_active)
    hex_std_rate = max(0.01, hex_mean_rate * 0.3)

    return RingContext(
        worker_vector=[
            worker_claim_rate,
            float(days_active) / 365.0,
            float(worker.active_days_30) / 30.0,
            float(worker.trust_score_floor),
            float(neighbor_ratio),
            0.0,
            0.0,
            0.0,
        ],
        neighborhood_vectors=[[hex_mean_rate] * 8],
        worker_claim_rate=worker_claim_rate,
        hex_mean_rate=hex_mean_rate,
        hex_std_rate=hex_std_rate,
    )


class ArgusFraudPipeline:
    def __init__(self) -> None:
        self.isolation_layer = IsolationLayer()

    async def evaluate(
        self,
        db: AsyncSession,
        worker: Worker,
        trigger: TriggerEvent,
        claim_data: Layer0ClaimData,
        claim_number: str | None = None,
    ) -> FraudResult:
        now = datetime.now(timezone.utc)
        passed, failed_checks, check_map = await layer0_rules(db, worker, trigger, claim_data)
        if not passed:
            result = FraudResult(
                status="blocked",
                combined_score=1.0,
                trust_score=0.0,
                isolation_score=1.0,
                z_score=1.0,
                ring_flag=1,
                fraud_flags=failed_checks,
                layers={"layer0": {"passed": False, "checks": check_map, "failed": failed_checks}},
            )
            logger.info(
                "argus_evaluated",
                claim_number=claim_number or "pending",
                worker_id=str(worker.id),
                trigger_id=str(trigger.id),
                status=result.status,
                combined_score=result.combined_score,
            )
            return result

        signal_data = _build_signal_data(worker, claim_data, now)
        trust_score, trust_signals = layer1_trust_score(signal_data, trigger.peril.value)

        isolation_features, neighbor_ratio = await _build_isolation_features(db, worker, trigger, now)
        isolation_score = self.isolation_layer.score(isolation_features)

        ring_context = await _build_ring_context(db, worker, neighbor_ratio, now)
        z_score_norm, ring_flag, raw_z = layer3_dbscan_and_zscore(ring_context)

        combined_score = combine_fraud_scores(trust_score, isolation_score, z_score_norm, float(ring_flag))
        combined_score = round(max(0.0, min(1.0, combined_score)), 4)
        fraud_flags: list[str] = []
        if combined_score >= 0.8:
            status = "blocked"
            fraud_flags.append("high_combined_risk")
        elif combined_score >= 0.5:
            status = "flagged"
            fraud_flags.append("soft_flag_review")
        else:
            status = "approved"

        result = FraudResult(
            status=status,
            combined_score=combined_score,
            trust_score=round(trust_score, 4),
            isolation_score=round(isolation_score, 4),
            z_score=round(raw_z, 4),
            ring_flag=ring_flag,
            fraud_flags=fraud_flags,
            layers={
                "layer0": {"passed": True, "checks": check_map, "failed": []},
                "layer1": {"trust_score": trust_score, "signals": trust_signals, "weights_applied": True},
                "layer2": {"isolation_score": isolation_score, "features": asdict(isolation_features)},
                "layer3": {"ring_flag": ring_flag, "z_score": raw_z, "z_score_normalized": z_score_norm},
            },
        )
        logger.info(
            "argus_evaluated",
            claim_number=claim_number or "pending",
            worker_id=str(worker.id),
            trigger_id=str(trigger.id),
            status=result.status,
            combined_score=result.combined_score,
        )
        return result

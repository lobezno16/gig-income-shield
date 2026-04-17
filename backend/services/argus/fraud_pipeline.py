from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from models import TriggerEvent, Worker
from services.argus.layer0_rules import Layer0ClaimData
from services.argus.layer1_device_integrity import evaluate_device_integrity
from services.argus.layer2_h3_velocity import evaluate_h3_velocity
from services.argus.layer3_behavioral_consistency import evaluate_behavioral_consistency
from services.argus.layer4_multi_source_consensus import evaluate_multi_source_consensus

logger = structlog.get_logger("soteria.argus.v2")


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, float(value)))


def _dedupe_preserve_order(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        if item in seen:
            continue
        out.append(item)
        seen.add(item)
    return out


@dataclass
class FraudResult:
    status: str
    combined_score: float
    fraud_flags: list[str]
    layers: dict[str, Any]
    requires_manual_review: bool


def combine_fraud_scores(trust: float, isolation: float, z_score: float, ring_flag: float) -> float:
    """
    Backward-compatible scorer signature retained for existing tests and call sites.
    For ARGUS v2 these inputs represent Layer1-4 risk scores respectively.
    """
    weighted = (
        (_clamp(trust) * 0.30)
        + (_clamp(isolation) * 0.25)
        + (_clamp(z_score) * 0.25)
        + (_clamp(ring_flag) * 0.20)
    )
    return round(_clamp(weighted), 4)


class ArgusFraudPipeline:
    """
    ARGUS v2 - four-layer async fraud pipeline:
    1) Device Integrity
    2) H3 Velocity Feasibility
    3) Historical Behavioral Consistency
    4) Multi-source (Weather vs Traffic) Consensus
    """

    async def evaluate(
        self,
        db: AsyncSession,
        worker: Worker,
        trigger: TriggerEvent,
        claim_data: Layer0ClaimData,
        claim_number: str | None = None,
    ) -> FraudResult:
        layer1 = await evaluate_device_integrity(claim_data)
        layer2 = await evaluate_h3_velocity(claim_data, city=worker.city or trigger.city)
        layer3 = await evaluate_behavioral_consistency(
            db,
            worker_id=worker.id,
            target_h3_hex=trigger.h3_hex,
        )
        layer4 = await evaluate_multi_source_consensus(trigger, claim_data)

        layer_scores = {
            "layer1_device_integrity": layer1.risk_score,
            "layer2_h3_velocity": layer2.risk_score,
            "layer3_behavioral_consistency": layer3.risk_score,
            "layer4_multi_source_consensus": layer4.risk_score,
        }
        combined_score = combine_fraud_scores(
            layer_scores["layer1_device_integrity"],
            layer_scores["layer2_h3_velocity"],
            layer_scores["layer3_behavioral_consistency"],
            layer_scores["layer4_multi_source_consensus"],
        )

        hard_block = any(
            [
                layer1.decision == "blocked",
                layer2.decision == "blocked",
                layer3.decision == "blocked",
                layer4.decision == "blocked",
            ]
        )
        any_flagged = any(
            [
                layer1.decision == "flagged",
                layer2.decision == "flagged",
                layer3.decision == "flagged",
                layer4.decision == "flagged",
            ]
        )

        if hard_block:
            status = "blocked"
        elif any_flagged or combined_score >= 0.55:
            status = "flagged"
        else:
            status = "approved"

        fraud_flags = _dedupe_preserve_order(
            layer1.flags + layer2.flags + layer3.flags + layer4.flags
        )
        requires_manual_review = status == "flagged"
        layers = {
            "layer1_device_integrity": {
                "passed": layer1.passed,
                "decision": layer1.decision,
                "risk_score": layer1.risk_score,
                "flags": layer1.flags,
                "evidence": layer1.evidence,
            },
            "layer2_h3_velocity": {
                "passed": layer2.passed,
                "decision": layer2.decision,
                "risk_score": layer2.risk_score,
                "flags": layer2.flags,
                "evidence": layer2.evidence,
            },
            "layer3_behavioral_consistency": {
                "passed": layer3.passed,
                "decision": layer3.decision,
                "risk_score": layer3.risk_score,
                "flags": layer3.flags,
                "evidence": layer3.evidence,
            },
            "layer4_multi_source_consensus": {
                "passed": layer4.passed,
                "decision": layer4.decision,
                "risk_score": layer4.risk_score,
                "flags": layer4.flags,
                "evidence": layer4.evidence,
            },
            "summary": {
                "combined_score": combined_score,
                "status": status,
                "requires_manual_review": requires_manual_review,
                "scoring_weights": {
                    "layer1_device_integrity": 0.30,
                    "layer2_h3_velocity": 0.25,
                    "layer3_behavioral_consistency": 0.25,
                    "layer4_multi_source_consensus": 0.20,
                },
            },
        }

        logger.info(
            "argus_v2_evaluated",
            claim_number=claim_number or "pending",
            worker_id=str(worker.id),
            trigger_id=str(trigger.id),
            status=status,
            combined_score=combined_score,
            fraud_flags=fraud_flags,
        )
        return FraudResult(
            status=status,
            combined_score=combined_score,
            fraud_flags=fraud_flags,
            layers=layers,
            requires_manual_review=requires_manual_review,
        )


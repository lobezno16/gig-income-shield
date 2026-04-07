from __future__ import annotations

from datetime import datetime, timedelta, timezone

import h3
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth_utils import create_access_token, create_refresh_token
from constants import ALL_COVERED_PERILS, CITY_POOL_DEFAULTS, CITY_URBAN_TIER, DEFAULT_IRDAI_SANDBOX_ID, H3_ZONES, IRDAI_EXCLUSIONS
from config import get_settings
from database import get_db
from models import PlanType, Platform, Policy, PolicyStatus, PoolConfig, PremiumRecord, Worker, WorkerTier
from redis_client import get_redis
from response import error_response, request_id_from_request, success_response
from schemas.worker import EnrollmentRequest
from services.athena.premium_engine import AthenaPremiumEngine
from services.id_gen import generate_policy_number
from services.otp_service import consume_phone_verification

router = APIRouter(prefix="/api/policy", tags=["registration"])
settings = get_settings()


def tier_from_active_days(days: int) -> WorkerTier:
    if days >= 20:
        return WorkerTier.gold
    if days >= 10:
        return WorkerTier.silver
    if days >= 5:
        return WorkerTier.bronze
    return WorkerTier.restricted


def resolve_hex_and_zone(latitude: float, longitude: float, city: str) -> tuple[str, dict]:
    hex_id = h3.latlng_to_cell(latitude, longitude, 7)
    zone = H3_ZONES.get(hex_id)
    if zone:
        return hex_id, zone

    for z_hex, z in H3_ZONES.items():
        if z["city"] == city.lower():
            return z_hex, z
    fallback_hex = next(iter(H3_ZONES.keys()))
    return fallback_hex, H3_ZONES[fallback_hex]


@router.post("/enroll")
async def enroll_worker(
    payload: EnrollmentRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    redis_client=Depends(get_redis),
):
    request_id = request_id_from_request(request)
    verified = await consume_phone_verification(payload.phone, payload.otp_token, redis_client)
    if not verified:
        return error_response(
            code="OTP_TOKEN_INVALID",
            message="OTP token invalid or expired.",
            status_code=401,
            request_id=request_id,
        )

    city = payload.city.lower()
    hex_id, zone = resolve_hex_and_zone(payload.latitude, payload.longitude, city)
    pool_id = zone.get("pool", CITY_POOL_DEFAULTS.get(city, "delhi_aqi_pool"))
    urban_tier = int(zone.get("urban_tier", CITY_URBAN_TIER.get(city, 1)))

    pool_cfg = (await db.execute(select(PoolConfig).where(PoolConfig.pool_id == pool_id))).scalar_one_or_none()
    if pool_cfg and pool_cfg.is_enrollment_suspended:
        return error_response(
            code="POOL_SUSPENDED",
            message=f"New enrollments are temporarily suspended for pool '{pool_id}'.",
            details={"pool_id": pool_id, "reason": pool_cfg.suspension_reason},
            status_code=409,
            request_id=request_id,
        )

    active_days_30 = 12
    tier = tier_from_active_days(active_days_30)

    stmt = select(Worker).where(Worker.phone == payload.phone)
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing:
        worker = existing
        worker.name = payload.name
        worker.platform = Platform(payload.platform)
        worker.platform_id = payload.platform_worker_id
        worker.city = city
        worker.h3_hex = hex_id
        worker.upi_id = payload.upi_id
        worker.active_days_30 = active_days_30
        worker.tier = tier
    else:
        worker = Worker(
            phone=payload.phone,
            name=payload.name,
            platform=Platform(payload.platform),
            platform_id=payload.platform_worker_id,
            city=city,
            h3_hex=hex_id,
            upi_id=payload.upi_id,
            tier=tier,
            active_days_30=active_days_30,
            total_deliveries=active_days_30 * 28,
            is_active=True,
        )
        db.add(worker)
    await db.commit()
    await db.refresh(worker)

    plan = PlanType(payload.plan)
    athena = AthenaPremiumEngine(db)
    premium = await athena.calculate_premium(worker=worker, plan=plan, pool_id=pool_id, urban_tier=urban_tier)

    policy_number = generate_policy_number()
    activated_at = datetime.now(timezone.utc)
    expires_at = activated_at + timedelta(days=30)
    policy = Policy(
        worker_id=worker.id,
        policy_number=policy_number,
        plan=plan,
        status=PolicyStatus.active,
        pool_id=pool_id,
        urban_tier=urban_tier,
        coverage_perils=ALL_COVERED_PERILS,
        weekly_premium=premium.final_premium,
        max_payout_week=premium.max_payout,
        coverage_days=premium.days_covered,
        warranty_met=worker.active_days_30 >= 7,
        activated_at=activated_at,
        expires_at=expires_at,
        irdai_sandbox_id=DEFAULT_IRDAI_SANDBOX_ID,
    )
    db.add(policy)
    await db.commit()
    await db.refresh(policy)

    record = PremiumRecord(
        worker_id=worker.id,
        policy_id=policy.id,
        week_start=activated_at.date(),
        base_formula=premium.base_cost,
        ml_adjustment=premium.ml_adjustment,
        final_premium=premium.final_premium,
        shap_values=premium.shap_values,
        bayesian_probs={premium.peril: premium.trigger_probability},
        features=premium.features,
    )
    db.add(record)
    await db.commit()

    shap_top = sorted(
        [(k, v) for k, v in premium.shap_values.items() if isinstance(v, (float, int))],
        key=lambda x: abs(x[1]),
        reverse=True,
    )[:3]

    data = {
        "policy_number": policy.policy_number,
        "worker": {
            "id": str(worker.id),
            "name": worker.name,
            "phone": worker.phone,
            "role": worker.role.value,
            "platform": worker.platform.value,
            "tier": worker.tier.value,
            "h3_hex": worker.h3_hex,
            "active_days_30": worker.active_days_30,
        },
        "coverage": {
            "plan": policy.plan.value,
            "status": policy.status.value,
            "pool": policy.pool_id,
            "urban_tier": policy.urban_tier,
            "weekly_premium_inr": float(policy.weekly_premium),
            "max_payout_per_week_inr": float(policy.max_payout_week),
            "coverage_days_per_week": policy.coverage_days,
            "covered_perils": policy.coverage_perils,
            "warranty_met": policy.warranty_met,
            "activated_at": policy.activated_at.isoformat() if policy.activated_at else None,
            "expires_at": policy.expires_at.isoformat() if policy.expires_at else None,
        },
        "irdai_compliance": {
            "sandbox_id": policy.irdai_sandbox_id,
            "product_type": "parametric_income_protection",
            "exclusions_version": "v2.1",
            "exclusions": IRDAI_EXCLUSIONS,
        },
        "premium_this_week": {
            "amount_inr": float(policy.weekly_premium),
            "calculation_date": activated_at.date().isoformat(),
            "trigger_probability": premium.trigger_probability,
            "shap_top_features": [f"{k}: {v:+.1f}" for k, v in shap_top],
            "breakdown": {
                "trigger_probability": premium.trigger_probability,
                "base_cost": premium.base_cost,
                "city_factor": premium.city_factor,
                "peril_factor": premium.peril_factor,
                "tier_factor": premium.tier_factor,
                "ml_adjustment": premium.ml_adjustment,
                "raw_premium": premium.raw_premium,
                "min_premium": premium.min_premium,
                "max_premium": premium.max_premium_cap,
                "final_premium": premium.final_premium,
            },
        },
    }

    access_token = create_access_token(subject=str(worker.id), role=worker.role.value, phone=worker.phone)
    refresh_token = create_refresh_token(subject=str(worker.id), role=worker.role.value, phone=worker.phone)
    response = JSONResponse(content=success_response(data, request_id=request_id))
    response.set_cookie(
        key="soteria_auth",
        value=access_token,
        httponly=True,
        secure=settings.environment == "production",
        samesite="strict",
        max_age=86400,
        path="/",
    )
    response.set_cookie(
        key="soteria_refresh",
        value=refresh_token,
        httponly=True,
        secure=settings.environment == "production",
        samesite="strict",
        max_age=604800,
        path="/auth",
    )
    return response

from __future__ import annotations

import asyncio
import random
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import numpy as np
from sqlalchemy import delete

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from constants import ALL_COVERED_PERILS, H3_ZONES
from database import AsyncSessionLocal
from ml.synthetic_data import generate_weather_series
from ml.train import train_models
from models import BCRRecord, BayesianPosterior, Claim, ClaimStatus, H3RiskProfile, PerilType, PlanType, Platform, Policy, PolicyStatus, Payout, PremiumRecord, TriggerEvent, Worker, WorkerTier
from services.id_gen import generate_claim_number, generate_policy_number


NAMES = [
    "Ravi Kumar",
    "Priya Sharma",
    "Arjun Nair",
    "Sunita Devi",
    "Mohammed Rizwan",
    "Kavitha Krishnan",
    "Rajesh Patel",
    "Meena Gupta",
    "Sanjay Yadav",
    "Anita Singh",
    "Rohit Verma",
    "Pooja Iyer",
    "Vikas Mehta",
    "Neha Kapoor",
    "Imran Khan",
    "Lakshmi Narayanan",
    "Deepak Mishra",
    "Ayesha Siddiqui",
    "Karthik Raman",
    "Sneha Joshi",
    "Manoj Tiwari",
    "Shreya Menon",
    "Faizan Ali",
    "Divya Reddy",
    "Abhishek Roy",
    "Nisha Bansal",
    "Harish Shetty",
    "Komal Jain",
    "Tanmoy Das",
    "Rekha Yadav",
    "Nitin Chawla",
    "Farah Noor",
    "Sudeep Sen",
    "Gauri Prasad",
    "Varun Malhotra",
    "Anjali Patil",
    "Yogesh Solanki",
    "Priyanka Das",
    "Kunal Arora",
    "Madhavi Rao",
    "Sameer Kulkarni",
    "Ritu Agarwal",
    "Amanpreet Singh",
    "Nandini Bose",
    "Parth Shah",
    "Hina Khan",
    "Rakesh Mondal",
    "Sahana Murthy",
    "Aditya Jha",
    "Monika Chatterjee",
]


def progress(current: int, total: int, label: str) -> None:
    width = 32
    fill = int(width * current / total)
    bar = "#" * fill + "-" * (width - fill)
    print(f"\r[{bar}] {current:>3}/{total:<3} {label}", end="", flush=True)
    if current == total:
        print()


def tier_for_days(days: int) -> WorkerTier:
    if days >= 20:
        return WorkerTier.gold
    if days >= 10:
        return WorkerTier.silver
    if days >= 5:
        return WorkerTier.bronze
    return WorkerTier.restricted


def shift_window_for_platform(platform: str) -> tuple[int, int]:
    if platform == "blinkit":
        return 7, 23
    if platform == "zepto":
        return 8, 23
    if platform == "swiggy":
        return 10, 22
    return 9, 22



async def clear_database(db) -> None:
    tables_to_clear = [Payout, Claim, TriggerEvent, PremiumRecord, Policy, BayesianPosterior, H3RiskProfile, BCRRecord, Worker]
    for idx, table in enumerate(tables_to_clear):
        await db.execute(delete(table))
        progress(idx + 1, len(tables_to_clear), "clearing tables")
    await db.commit()

async def seed_workers(db, platforms, zone_items) -> list[Worker]:
    workers: list[Worker] = []
    for i in range(50):
        h3_hex, zone = zone_items[i % len(zone_items)]
        days = random.randint(4, 26)
        platform_value = random.choice(platforms)
        shift_start_hour, shift_end_hour = shift_window_for_platform(platform_value)
        worker = Worker(
            phone=f"+91{6000000000 + i * 53197 + 12345}",
            name=NAMES[i],
            platform=Platform(platform_value),
            platform_id=f"PLT{2026}{i+1:04d}",
            city=zone["city"],
            h3_hex=h3_hex,
            upi_id=NAMES[i].lower().replace(" ", ".") + "@ybl",
            tier=tier_for_days(days),
            active_days_30=days,
            total_deliveries=random.randint(120, 1100),
            trust_score_floor=0.40,
            shift_start_hour=shift_start_hour,
            shift_end_hour=shift_end_hour,
            is_active=True,
        )
        db.add(worker)
        workers.append(worker)
        progress(i + 1, 50, "seeding workers")
    await db.commit()
    for w in workers:
        await db.refresh(w)
    return workers

async def seed_policies(db, workers) -> list[Policy]:
    policies: list[Policy] = []
    plans = [PlanType.lite, PlanType.standard, PlanType.pro]
    plan_cfg = {
        PlanType.lite: (3, 400, 20, 30),
        PlanType.standard: (5, 700, 30, 40),
        PlanType.pro: (6, 1200, 40, 50),
    }
    for i, worker in enumerate(workers):
        zone = H3_ZONES.get(worker.h3_hex)
        plan = random.choice(plans)
        days, max_payout, min_p, max_p = plan_cfg[plan]
        weekly = round(random.uniform(min_p, max_p), 2)
        activated = datetime.now(timezone.utc) - timedelta(days=random.randint(5, 90))
        policy = Policy(
            worker_id=worker.id,
            policy_number=generate_policy_number(),
            plan=plan,
            status=PolicyStatus.active,
            pool_id=zone["pool"] if zone else f"{worker.city}_pool",
            urban_tier=int(zone["urban_tier"]) if zone else 1,
            coverage_perils=ALL_COVERED_PERILS,
            weekly_premium=weekly,
            max_payout_week=max_payout,
            coverage_days=days,
            warranty_met=worker.active_days_30 >= 7,
            activated_at=activated,
            expires_at=activated + timedelta(days=30),
            irdai_sandbox_id="SB-2026-042",
        )
        db.add(policy)
        policies.append(policy)
        progress(i + 1, 50, "seeding policies")
    await db.commit()
    for p in policies:
        await db.refresh(p)
    return policies

async def seed_triggers(db, zone_items) -> list[TriggerEvent]:
    triggers: list[TriggerEvent] = []
    perils = ["aqi", "rain", "curfew"]
    peril_range = {
        "aqi": (260, 720),
        "rain": (4, 72),
        "curfew": (6, 95),
    }
    for i in range(120):
        h3_hex, zone = random.choice(zone_items)
        peril = random.choice(perils)
        lo, hi = peril_range[peril]
        reading = round(random.uniform(lo, hi), 2)
        level = (
            3
            if reading > {"aqi": 650, "rain": 40, "curfew": 70}[peril]
            else 2
            if reading > {"aqi": 550, "rain": 25, "curfew": 55}[peril]
            else 1
            if reading > {"aqi": 450, "rain": 15, "curfew": 40}[peril]
            else 0
        )
        if level == 0:
            continue
        payout_pct = 1.0 if level == 3 else 0.6 if level == 2 else 0.3
        trigger = TriggerEvent(
            peril=PerilType(peril),
            source="seed_generator",
            reading_value=reading,
            trigger_level=level,
            payout_pct=payout_pct,
            city=zone["city"],
            h3_hex=h3_hex,
            workers_affected=random.randint(20, 240),
            total_payout_inr=0,
            triggered_at=datetime.now(timezone.utc) - timedelta(days=random.randint(1, 90), hours=random.randint(0, 23)),
        )
        db.add(trigger)
        triggers.append(trigger)
        progress(i + 1, 120, "seeding triggers")
    await db.commit()
    for t in triggers:
        await db.refresh(t)
    return triggers

async def seed_claims(db, workers, policies, triggers) -> list[Claim]:
    claims: list[Claim] = []
    for i in range(200):
        worker = random.choice(workers)
        policy = next(p for p in policies if p.worker_id == worker.id)
        trigger = random.choice([t for t in triggers if t.h3_hex == worker.h3_hex] or triggers)
        fraud_score = round(random.uniform(0.05, 0.92), 2)
        status = ClaimStatus.paid if fraud_score < 0.5 else ClaimStatus.flagged if fraud_score < 0.8 else ClaimStatus.blocked
        payout_pct = 1.0 if status == ClaimStatus.paid else 0.8 if status == ClaimStatus.flagged else 0.0
        payout = round(random.uniform(180, float(policy.max_payout_week) / 2) * payout_pct, 2)
        claim = Claim(
            claim_number=generate_claim_number(),
            worker_id=worker.id,
            policy_id=policy.id,
            trigger_id=trigger.id,
            status=status,
            payout_amount=payout,
            payout_pct=trigger.payout_pct,
            fraud_score=fraud_score,
            fraud_flags=["soft_flag_review"] if status == ClaimStatus.flagged else ["high_combined_risk"] if status == ClaimStatus.blocked else [],
            argus_layers={"layer0": {"passed": True}, "layer1": {"trust_score": round(1 - fraud_score / 2, 2)}},
            upi_ref=f"HDFC{random.randint(10000000, 99999999)}" if status == ClaimStatus.paid else None,
            settled_at=datetime.now(timezone.utc) - timedelta(days=random.randint(0, 45)) if status == ClaimStatus.paid else None,
            created_at=datetime.now(timezone.utc) - timedelta(days=random.randint(0, 90)),
        )
        db.add(claim)
        claims.append(claim)
        progress(i + 1, 200, "seeding claims")
    await db.commit()
    return claims

async def seed_premiums(db, policies) -> None:
    for i, policy in enumerate(policies):
        for week in range(12):
            week_start = date.today() - timedelta(weeks=week)
            premium = float(policy.weekly_premium) + random.uniform(-2.5, 2.5)
            premium = max(20.0, round(premium, 2))
            record = PremiumRecord(
                worker_id=policy.worker_id,
                policy_id=policy.id,
                week_start=week_start,
                base_formula=round(premium * 1.4, 2),
                ml_adjustment=round(random.uniform(-5, 5), 2),
                final_premium=premium,
                shap_values={
                    "forecast_rain_next_7d": round(random.uniform(-2, 3), 2),
                    "historical_claim_freq_hex": round(random.uniform(-1, 2), 2),
                    "past_week_avg_aqi": round(random.uniform(-1.5, 2.5), 2),
                    "season": round(random.uniform(-1, 1), 2),
                },
                bayesian_probs={"rain": round(random.uniform(0.08, 0.22), 4)},
                features={"urban_tier": policy.urban_tier},
            )
            db.add(record)
        progress(i + 1, 50, "seeding premiums")
    await db.commit()

async def seed_h3_profiles_and_posteriors(db) -> None:
    profiles = 0
    for h3_hex, zone in H3_ZONES.items():
        for peril in ALL_COVERED_PERILS:
            p50 = round(random.uniform(0.06, 0.24), 4)
            profile = H3RiskProfile(
                h3_hex=h3_hex,
                peril=peril,
                city=zone["city"],
                pool_id=zone["pool"],
                urban_tier=zone["urban_tier"],
                trigger_prob_p10=max(0.01, round(p50 * 0.7, 4)),
                trigger_prob_p50=p50,
                trigger_prob_p90=min(0.45, round(p50 * 1.4, 4)),
                historical_years=10,
            )
            db.add(profile)
            alpha = p50 * 520 + 1
            beta = (1 - p50) * 520 + 1
            posterior = BayesianPosterior(
                h3_hex=h3_hex,
                peril=peril,
                alpha=round(alpha, 4),
                beta_param=round(beta, 4),
                trigger_prob=round(alpha / (alpha + beta), 4),
            )
            db.add(posterior)
            profiles += 1
            progress(profiles, len(H3_ZONES) * len(ALL_COVERED_PERILS), "risk profiles + posteriors")
    await db.commit()

async def seed_bcr_records(db) -> None:
    pools = sorted({z["pool"] for z in H3_ZONES.values()})
    total_bcr_rows = 12 * len(pools)
    row_counter = 0
    for pool in pools:
        for w in range(12):
            period_end = date.today() - timedelta(days=w * 7)
            period_start = period_end - timedelta(days=6)
            premiums_total = random.uniform(4_000_000, 6_200_000)
            target_bcr = random.uniform(0.55, 0.70)
            claims_total = premiums_total * target_bcr
            status = "healthy" if target_bcr < 0.7 else "warning"
            row = BCRRecord(
                pool_id=pool,
                period_start=period_start,
                period_end=period_end,
                total_premiums=round(premiums_total, 2),
                total_claims=round(claims_total, 2),
                bcr=round(target_bcr, 4),
                status=status,
            )
            db.add(row)
            row_counter += 1
            progress(row_counter, total_bcr_rows, "bcr history")
    await db.commit()

async def main() -> None:
    random.seed(42)
    np.random.seed(42)

    weather = generate_weather_series(2016, 2026, seed=42)
    # The synthetic weather frame is generated for realistic risk derivation and model training context.
    _ = weather

    async with AsyncSessionLocal() as db:
        await clear_database(db)

        platforms = ["zepto", "blinkit", "swiggy", "zomato"]
        zone_items = list(H3_ZONES.items())

        workers = await seed_workers(db, platforms, zone_items)
        policies = await seed_policies(db, workers)
        triggers = await seed_triggers(db, zone_items)
        claims = await seed_claims(db, workers, policies, triggers)
        await seed_premiums(db, policies)
        await seed_h3_profiles_and_posteriors(db)
        await seed_bcr_records(db)

    artifacts = train_models("./ml/models")
    print(f"Model artifacts: {artifacts}")
    print("[OK] Soteria seed data loaded. 50 workers, 200 claims, 10 H3 zones.")

if __name__ == "__main__":
    asyncio.run(main())

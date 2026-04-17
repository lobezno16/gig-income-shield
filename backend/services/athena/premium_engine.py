from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from models import PlanType, Worker, WorkerTier
from services.athena.bayesian_updater import BayesianBetaBinomial
from services.athena.feature_engineer import deterministic_feature_seed
from services.athena.random_forest import RandomForestPremiumModel

CITY_FACTORS = {
    "delhi": 0.85,
    "mumbai": 0.90,
    "chennai": 0.90,
    "bangalore": 0.85,
    "kolkata": 1.10,
    "lucknow": 1.00,
    "pune": 0.90,
    "ahmedabad": 0.90,
    "hyderabad": 0.88,
    "jaipur": 0.95,
    "nagpur": 0.95,
}

PERIL_FACTORS = {
    "aqi": 0.90,
    "rain": 1.00,
    "curfew": 1.05,
}

TIER_FACTORS = {"gold": 0.85, "silver": 1.00, "bronze": 1.15, "restricted": 1.30}
URBAN_TIER_MULTIPLIERS = {1: 0.70, 2: 0.85, 3: 1.00, 4: 1.30}
PLAN_CONFIG = {
    "lite": {"days": 3, "max_payout": 400, "min_premium": 20, "max_premium": 30},
    "standard": {"days": 5, "max_payout": 700, "min_premium": 30, "max_premium": 40},
    "pro": {"days": 6, "max_payout": 1200, "min_premium": 40, "max_premium": 50},
}

DAILY_INCOME_BY_PLATFORM = {"zepto": 1000, "zomato": 950, "swiggy": 900, "blinkit": 980}

POOL_PRIMARY_PERIL = {
    "delhi_aqi_pool": "aqi",
    "mumbai_rain_pool": "rain",
    "chennai_rain_pool": "rain",
    "bangalore_mixed_pool": "curfew",
    "kolkata_flood_pool": "rain",
    "lucknow_aqi_pool": "aqi",
    "pune_rain_pool": "rain",
    "ahmedabad_heat_pool": "aqi",
    "hyderabad_heat_pool": "aqi",
    "jaipur_heat_pool": "aqi",
    "nagpur_heat_pool": "aqi",
}


@dataclass
class PremiumResult:
    final_premium: float
    base_cost: float
    raw_premium: float
    trigger_probability: float
    city_factor: float
    peril_factor: float
    tier_factor: float
    ml_adjustment: float
    shap_values: dict[str, float]
    base_value: float
    days_covered: int
    max_payout: float
    min_premium: float
    max_premium_cap: float
    peril: str
    features: dict[str, float]


class AthenaPremiumEngine:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.rf_model = RandomForestPremiumModel()

    async def calculate_premium(self, worker: Worker, plan: PlanType, pool_id: str, urban_tier: int) -> PremiumResult:
        plan_cfg = PLAN_CONFIG[plan.value if isinstance(plan, PlanType) else str(plan)]
        primary_peril = POOL_PRIMARY_PERIL.get(pool_id, "rain")

        bayes = BayesianBetaBinomial(self.db)
        trigger_prob = await bayes.get_trigger_probability(worker.h3_hex, primary_peril)

        daily_income = DAILY_INCOME_BY_PLATFORM[worker.platform.value]
        days_exposed = int(plan_cfg["days"])
        base_cost = trigger_prob * daily_income * days_exposed

        city_factor = CITY_FACTORS.get(worker.city, 1.0)
        peril_factor = PERIL_FACTORS.get(primary_peril, 1.0)
        tier_factor = TIER_FACTORS.get(worker.tier.value if isinstance(worker.tier, WorkerTier) else str(worker.tier), 1.0)

        features = deterministic_feature_seed(worker.h3_hex)
        features["urban_tier"] = float(urban_tier)
        ml_adjustment, shap_values, base_value = self.rf_model.predict_adjustment(features)

        raw_premium = base_cost * city_factor * peril_factor * tier_factor
        raw_premium += ml_adjustment

        min_premium = float(plan_cfg["min_premium"])
        max_premium_cap = float(plan_cfg["max_premium"])
        final_premium = max(min_premium, min(max_premium_cap, round(raw_premium, 2)))

        return PremiumResult(
            final_premium=float(final_premium),
            base_cost=round(base_cost, 2),
            raw_premium=round(raw_premium, 2),
            trigger_probability=round(trigger_prob, 4),
            city_factor=city_factor,
            peril_factor=peril_factor,
            tier_factor=tier_factor,
            ml_adjustment=round(ml_adjustment, 2),
            shap_values=shap_values,
            base_value=round(base_value, 3),
            days_covered=days_exposed,
            max_payout=float(plan_cfg["max_payout"]),
            min_premium=min_premium,
            max_premium_cap=max_premium_cap,
            peril=primary_peril,
            features=features,
        )

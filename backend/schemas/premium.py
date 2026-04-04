from datetime import date
from typing import Literal

from pydantic import BaseModel


class PremiumBreakdown(BaseModel):
    trigger_probability: float
    avg_daily_income: float
    days_covered: int
    base_cost: float
    city_factor: float
    peril_factor: float
    worker_tier_factor: float
    ml_adjustment_inr: float
    raw_premium: float
    final_premium: float
    plan_min: float
    plan_max: float


class PremiumCalculationRequest(BaseModel):
    worker_id: str | None = None
    city: str
    platform: Literal["zepto", "zomato", "swiggy", "blinkit"]
    plan: Literal["lite", "standard", "pro"]
    tier: Literal["gold", "silver", "bronze", "restricted"] = "silver"
    h3_hex: str


class PremiumHistoryItem(BaseModel):
    week_start: date
    final_premium: float
    base_formula: float
    ml_adjustment: float


class PredictiveCoverageRequest(BaseModel):
    worker_id: str
    days_requested: int
    peril: Literal["aqi", "rain", "heat", "flood", "storm", "curfew", "store"]


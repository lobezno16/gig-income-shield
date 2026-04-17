from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class PolicyCoverage(BaseModel):
    plan: Literal["lite", "standard", "pro"]
    status: Literal["active", "lapsed", "suspended"]
    pool: str
    urban_tier: int
    weekly_premium_inr: float
    max_payout_per_week_inr: float
    coverage_days_per_week: int
    covered_perils: list[str]
    warranty_met: bool
    activated_at: datetime | None = None
    expires_at: datetime | None = None


class PolicyCompliance(BaseModel):
    sandbox_id: str
    product_type: str = "parametric_income_protection"
    exclusions_version: str = "v2.1"
    exclusions: list[str]
    loss_scope: str = "loss_of_income_only"
    billing_cadence: str = "weekly"
    peril_trigger_rules: dict[str, str] = {}


class PremiumThisWeek(BaseModel):
    amount_inr: float
    calculation_date: str
    trigger_probability: float
    shap_top_features: list[str]


class WorkerPolicySnapshot(BaseModel):
    id: str
    name: str
    phone: str
    platform: str
    tier: str
    h3_hex: str
    active_days_30: int


class PolicyResponseBody(BaseModel):
    policy_number: str
    worker: WorkerPolicySnapshot
    coverage: PolicyCoverage
    irdai_compliance: PolicyCompliance
    premium_this_week: PremiumThisWeek


class UpdatePlanRequest(BaseModel):
    plan: Literal["lite", "standard", "pro"]

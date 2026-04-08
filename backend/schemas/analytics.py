from pydantic import BaseModel


class BCRPoolPoint(BaseModel):
    pool_id: str
    bcr: float
    total_premiums: float | None = None
    total_claims: float | None = None
    paid_count: int | None = None
    status: str
    trend_4w: list[float]
    suspended: bool


class PoolUtilization(BaseModel):
    pool_id: str | None
    bcr: float
    status: str | None = None


class OverviewMetrics(BaseModel):
    active_policies: int
    total_workers: int
    premiums_this_week: float
    claims_paid: float
    claims_paid_week: float
    claims_this_week_count: int
    pending_review_count: int
    avg_settlement_time_hours: float
    avg_fraud_score: float
    pool_bcr: float
    pool_bcr_pool_id: str | None
    pool_utilization: PoolUtilization
    week_bcr: float

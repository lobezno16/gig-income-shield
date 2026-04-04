from pydantic import BaseModel


class BCRPoolPoint(BaseModel):
    pool_id: str
    bcr: float
    status: str
    trend_4w: list[float]
    suspended: bool


class OverviewMetrics(BaseModel):
    active_policies: int
    total_workers: int
    premiums_this_week: float
    claims_paid: float
    avg_fraud_score: float
    pool_bcr: float


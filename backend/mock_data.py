from __future__ import annotations

from datetime import datetime, timedelta, timezone

MOCK_WORKERS = [
    {
        "id": "wkr_001",
        "name": "Ravi Kumar",
        "phone": "+919876543210",
        "platform": "zepto",
        "city": "delhi",
        "h3_hex": "872a1072bffffff",
        "upi_id": "ravi.kumar@ybl",
        "tier": "gold",
        "active_days_30": 24,
        "plan": "pro",
        "weekly_premium": 35,
        "max_payout_week": 1200,
    },
    {
        "id": "wkr_002",
        "name": "Priya Sharma",
        "phone": "+919123456780",
        "platform": "blinkit",
        "city": "mumbai",
        "h3_hex": "872be924bffffff",
        "upi_id": "priya.sharma@paytm",
        "tier": "silver",
        "active_days_30": 15,
        "plan": "standard",
        "weekly_premium": 32,
        "max_payout_week": 700,
    },
    {
        "id": "wkr_003",
        "name": "Arjun Nair",
        "phone": "+919988776655",
        "platform": "swiggy",
        "city": "chennai",
        "h3_hex": "874d44473ffffff",
        "upi_id": "arjun.nair@sbi",
        "tier": "bronze",
        "active_days_30": 7,
        "plan": "lite",
        "weekly_premium": 28,
        "max_payout_week": 400,
    },
]

MOCK_TRIGGER_EVENTS = [
    {
        "id": "trg_001",
        "peril": "aqi",
        "source": "cpcb_waqi",
        "reading_value": 380,
        "trigger_level": 1,
        "payout_pct": 0.30,
        "city": "delhi",
        "h3_hex": "872a1072bffffff",
        "workers_affected": 234,
        "total_payout_inr": 114000,
        "triggered_at": "2026-04-01T18:00:00+05:30",
        "label": "AQI 380 - Dwarka/Janakpuri, Delhi NCR",
    },
    {
        "id": "trg_002",
        "peril": "rain",
        "source": "imd_owm",
        "reading_value": 110,
        "trigger_level": 2,
        "payout_pct": 0.60,
        "city": "mumbai",
        "h3_hex": "872be924bffffff",
        "workers_affected": 189,
        "total_payout_inr": 113400,
        "triggered_at": "2026-04-05T14:14:00+05:30",
        "label": "110mm Rainfall - Dharavi/Kurla, Mumbai",
    },
    {
        "id": "trg_003",
        "peril": "curfew",
        "source": "tomtom_traffic",
        "reading_value": 52,
        "trigger_level": 2,
        "payout_pct": 0.60,
        "city": "bangalore",
        "h3_hex": "872d9e6c3ffffff",
        "workers_affected": 78,
        "total_payout_inr": 46800,
        "triggered_at": "2026-04-08T11:00:00+05:30",
        "label": "Traffic Delay 52 min/km - Koramangala/HSR, Bangalore",
    },
]

MOCK_POLICY_NUMBERS = [
    {"policy_number": "SOT-2026-001847", "worker_id": "wkr_001", "status": "active"},
    {"policy_number": "SOT-2026-002193", "worker_id": "wkr_002", "status": "active"},
    {"policy_number": "SOT-2026-003812", "worker_id": "wkr_003", "status": "active"},
]

MOCK_CLAIMS = [
    {"claim_number": "CLM-2026-00041823", "worker_id": "wkr_001", "status": "paid", "amount": 500},
    {"claim_number": "CLM-2026-00038291", "worker_id": "wkr_001", "status": "paid", "amount": 600},
    {"claim_number": "CLM-2026-00045102", "worker_id": "wkr_002", "status": "paid", "amount": 420},
]

MOCK_TIMELINE_TEMPLATE = [
    {
        "id": "trigger_detected",
        "label": "Disruption Detected",
        "description": "AQI 380 recorded at CPCB station - Dwarka zone",
        "timestamp": "Apr 1, 6:00 PM",
    },
    {
        "id": "eligibility_check",
        "label": "Eligibility Verified",
        "description": "Active policy | Warranty met | Zone confirmed",
        "timestamp": "Apr 1, 6:01 PM",
    },
    {
        "id": "fraud_check",
        "label": "Verification Complete",
        "description": "Trust score: 0.91 | All 4 layers passed",
        "timestamp": "Apr 1, 6:01 PM",
    },
    {
        "id": "payout_calculated",
        "label": "Payout Calculated",
        "description": "Rs 1,000 x 1 day x 30% x Tier 1 = Rs 210",
        "timestamp": "Apr 1, 6:01 PM",
    },
    {
        "id": "transfer_initiated",
        "label": "Transfer Initiated",
        "description": "Rs 210 -> ravi.kumar@ybl",
        "timestamp": "Apr 1, 6:03 PM",
    },
    {
        "id": "confirmed",
        "label": "Payment Confirmed",
        "description": "UPI Ref: HDFC83920182 | SMS sent",
        "timestamp": "Apr 1, 6:05 PM",
    },
]


def now_ist_iso() -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)).isoformat()

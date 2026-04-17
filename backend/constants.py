from datetime import date

# Product-level constraints for Soteria Phase 3.
PRODUCT_CODE = "parametric_income_protection"
BILLING_CADENCE = "weekly"
LOSS_SCOPE = "loss_of_income_only"

# Strictly supported operational perils for zero-touch income protection.
SUPPORTED_PARAMETRIC_PERILS = ("rain", "curfew", "aqi")
ALL_COVERED_PERILS = list(SUPPORTED_PARAMETRIC_PERILS)

PERIL_TRIGGER_RULES = {
    "rain": "Heavy rain greater than 15 mm/hr",
    "curfew": "Traffic disruption greater than 40 min/km",
    "aqi": "AQI greater than 450",
}

IRDAI_EXCLUSIONS = [
    "War, invasion, act of foreign enemy, hostilities, civil war, rebellion",
    "Nuclear reaction, radiation, or radioactive contamination",
    "Terrorism as defined under IRDAI Terrorism Pool guidelines",
    "Pandemic or epidemic declared by WHO or Government of India",
    "Government-ordered sanctions, embargoes, or prohibitions",
    "Intentional self-inflicted loss or criminal activity by the insured",
    "Loss arising outside the territory of India",
    "Pre-existing non-working status prior to policy activation (7-day warranty period)",
    "Vehicle repairs, mechanical breakdown - vehicle insurance is out of scope",
    "Health conditions, injuries, medical expenses - health insurance is out of scope",
    "Loss of life or bodily injury - life/accident insurance is out of scope",
]

H3_ZONES = {
    "872a1072bffffff": {"city": "delhi", "area": "dwarka_janakpuri", "urban_tier": 1, "pool": "delhi_aqi_pool"},
    "872a1078bffffff": {"city": "delhi", "area": "rohini_pitampura", "urban_tier": 1, "pool": "delhi_aqi_pool"},
    "872a10749ffffff": {"city": "delhi", "area": "lajpat_nagar", "urban_tier": 1, "pool": "delhi_aqi_pool"},
    "872be924bffffff": {"city": "mumbai", "area": "dharavi_kurla", "urban_tier": 1, "pool": "mumbai_rain_pool"},
    "872be9243ffffff": {"city": "mumbai", "area": "bandra_andheri", "urban_tier": 1, "pool": "mumbai_rain_pool"},
    "874d44473ffffff": {"city": "chennai", "area": "velachery_tambaram", "urban_tier": 1, "pool": "chennai_rain_pool"},
    "874d444b3ffffff": {"city": "chennai", "area": "anna_nagar", "urban_tier": 1, "pool": "chennai_rain_pool"},
    "872d9e6c3ffffff": {"city": "bangalore", "area": "koramangala_hsr", "urban_tier": 1, "pool": "bangalore_mixed_pool"},
    "872d9e6dbffffff": {
        "city": "bangalore",
        "area": "whitefield_marathahalli",
        "urban_tier": 1,
        "pool": "bangalore_mixed_pool",
    },
    "8730e88abffffff": {"city": "kolkata", "area": "salt_lake_newtown", "urban_tier": 4, "pool": "kolkata_flood_pool"},
}

CITY_POOL_DEFAULTS = {
    "delhi": "delhi_aqi_pool",
    "mumbai": "mumbai_rain_pool",
    "chennai": "chennai_rain_pool",
    "bangalore": "bangalore_mixed_pool",
    "kolkata": "kolkata_flood_pool",
    "lucknow": "lucknow_aqi_pool",
    "pune": "pune_rain_pool",
    "ahmedabad": "ahmedabad_heat_pool",
    "hyderabad": "hyderabad_heat_pool",
    "jaipur": "jaipur_heat_pool",
    "nagpur": "nagpur_heat_pool",
}

CITY_URBAN_TIER = {
    "delhi": 1,
    "mumbai": 1,
    "chennai": 1,
    "bangalore": 1,
    "kolkata": 4,
    "pune": 2,
    "ahmedabad": 2,
    "hyderabad": 2,
    "lucknow": 3,
    "jaipur": 3,
    "nagpur": 3,
}

DEFAULT_REQUEST_VERSION = "2.0"
DEFAULT_IRDAI_SANDBOX_ID = "SB-2026-042"

DEMO_TRIGGER_EVENT = {
    "id": "trg_demo_live",
    "peril": "aqi",
    "source": "cpcb_waqi",
    "reading_value": 380,
    "trigger_level": 1,
    "payout_pct": 0.30,
    "city": "delhi",
    "h3_hex": "872a1072bffffff",
    "workers_affected": 234,
    "total_payout_inr": 114000,
    "triggered_at": "2026-04-04T19:10:00+05:30",
    "label": "AQI 380 - Dwarka/Janakpuri, Delhi NCR",
}


def is_supported_parametric_peril(peril: str) -> bool:
    return peril.strip().lower() in SUPPORTED_PARAMETRIC_PERILS


def week_start_today() -> date:
    today = date.today()
    return today.fromordinal(today.toordinal() - today.weekday())

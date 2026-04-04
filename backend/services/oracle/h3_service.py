import h3

from constants import CITY_POOL_DEFAULTS, CITY_URBAN_TIER, H3_ZONES


def latlng_to_hex(latitude: float, longitude: float, resolution: int = 7) -> str:
    return h3.latlng_to_cell(latitude, longitude, resolution)


def lookup_zone(hex_id: str) -> dict:
    if hex_id in H3_ZONES:
        return H3_ZONES[hex_id]
    return {
        "city": "delhi",
        "area": "fallback_zone",
        "urban_tier": CITY_URBAN_TIER.get("delhi", 1),
        "pool": CITY_POOL_DEFAULTS.get("delhi", "delhi_aqi_pool"),
    }


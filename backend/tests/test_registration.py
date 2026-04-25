import pytest
from routers.registration import active_hour_window_from_platform

@pytest.mark.parametrize(
    "platform, expected",
    [
        ("blinkit", (7, 23)),
        ("zepto", (8, 23)),
        ("swiggy", (10, 22)),
        ("zomato", (9, 22)), # unknown platform edge case
        ("Blinkit", (9, 22)), # case sensitivity edge case
        ("", (9, 22)), # empty string edge case
        ("other_random_str", (9, 22)),
    ],
)
def test_active_hour_window_from_platform(platform: str, expected: tuple[int, int]):
    assert active_hour_window_from_platform(platform) == expected

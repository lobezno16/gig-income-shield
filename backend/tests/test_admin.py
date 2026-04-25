from routers.admin import _claim_flags

def test_claim_flags():
    assert _claim_flags(["flag1", "flag2"]) == ["flag1", "flag2"]
    assert _claim_flags([1, 2]) == ["1", "2"]
    assert _claim_flags([]) == []
    assert _claim_flags("not a list") == []
    assert _claim_flags(None) == []
    assert _claim_flags({"key": "value"}) == []

import json
import pytest
import os
from fastapi import Request
from backend.response import success_response, error_response, request_id_from_request

os.environ["SECRET_KEY"] = "this-is-a-very-long-secret-key-for-testing"

def test_success_response_default():
    data = {"key": "value"}
    res = success_response(data)
    assert res["success"] is True
    assert res["data"] == data
    assert "meta" in res
    assert "request_id" in res["meta"]
    assert "timestamp" in res["meta"]
    assert "version" in res["meta"]

def test_success_response_custom_request_id():
    data = {"key": "value"}
    req_id = "test-req-id"
    res = success_response(data, request_id=req_id)
    assert res["meta"]["request_id"] == req_id

def test_error_response_default():
    res = error_response(code="ERR_TEST", message="Test error message")
    assert res.status_code == 400

    body = json.loads(res.body.decode("utf-8"))
    assert body["success"] is False
    assert body["error"]["code"] == "ERR_TEST"
    assert body["error"]["message"] == "Test error message"
    assert body["error"]["details"] == {}
    assert "meta" in body
    assert "request_id" in body["meta"]
    assert "timestamp" in body["meta"]
    assert "version" in body["meta"]

def test_error_response_custom():
    res = error_response(
        code="ERR_CUSTOM",
        message="Custom error message",
        details={"field": "invalid"},
        status_code=404,
        request_id="custom-req-id"
    )
    assert res.status_code == 404

    body = json.loads(res.body.decode("utf-8"))
    assert body["success"] is False
    assert body["error"]["code"] == "ERR_CUSTOM"
    assert body["error"]["message"] == "Custom error message"
    assert body["error"]["details"] == {"field": "invalid"}
    assert body["meta"]["request_id"] == "custom-req-id"

def test_request_id_from_request_with_state():
    req = Request(scope={"type": "http", "state": {"request_id": "mock-req-id"}})

    req_id = request_id_from_request(req)
    assert req_id == "mock-req-id"

def test_request_id_from_request_without_state():
    req = Request(scope={"type": "http"})

    req_id = request_id_from_request(req)
    assert req_id is not None
    assert isinstance(req_id, str)
    assert len(req_id) > 0

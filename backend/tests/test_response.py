import json
from unittest.mock import MagicMock

import pytest
from fastapi import Request

from response import error_response, request_id_from_request, success_response


def test_success_response_default():
    data = {"key": "value"}
    resp = success_response(data)
    assert resp["success"] is True
    assert resp["data"] == data
    assert "request_id" in resp["meta"]
    assert "timestamp" in resp["meta"]
    assert "version" in resp["meta"]


def test_success_response_with_request_id():
    data = {"key": "value"}
    request_id = "test-request-id"
    resp = success_response(data, request_id=request_id)
    assert resp["success"] is True
    assert resp["data"] == data
    assert resp["meta"]["request_id"] == request_id


def test_error_response_default():
    code = "TEST_ERROR"
    message = "Test error message"
    resp = error_response(code=code, message=message)

    assert resp.status_code == 400

    content = json.loads(resp.body)
    assert content["success"] is False
    assert content["error"]["code"] == code
    assert content["error"]["message"] == message
    assert content["error"]["details"] == {}

    assert "request_id" in content["meta"]
    assert "timestamp" in content["meta"]
    assert "version" in content["meta"]


def test_error_response_custom_parameters():
    code = "CUSTOM_ERROR"
    message = "Custom error message"
    details = {"field": "invalid"}
    status_code = 404
    request_id = "custom-request-id"

    resp = error_response(
        code=code,
        message=message,
        details=details,
        status_code=status_code,
        request_id=request_id,
    )

    assert resp.status_code == 404

    content = json.loads(resp.body)
    assert content["success"] is False
    assert content["error"]["code"] == code
    assert content["error"]["message"] == message
    assert content["error"]["details"] == details
    assert content["meta"]["request_id"] == request_id


def test_request_id_from_request_with_existing_id():
    mock_request = MagicMock(spec=Request)
    mock_request.state.request_id = "existing-request-id"

    request_id = request_id_from_request(mock_request)
    assert request_id == "existing-request-id"


def test_request_id_from_request_without_existing_id():
    mock_request = MagicMock(spec=Request)
    del mock_request.state.request_id

    request_id = request_id_from_request(mock_request)
    assert request_id is not None
    assert isinstance(request_id, str)
    assert len(request_id) > 0

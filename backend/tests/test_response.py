import uuid
from unittest.mock import Mock

from response import request_id_from_request


def test_request_id_from_request_with_id():
    mock_request = Mock()
    mock_request.state.request_id = "test-id-123"
    assert request_id_from_request(mock_request) == "test-id-123"


def test_request_id_from_request_without_id():
    mock_request = Mock()
    del mock_request.state.request_id
    result = request_id_from_request(mock_request)
    assert result is not None
    assert isinstance(result, str)

    # Verify it is a valid UUID
    parsed_uuid = uuid.UUID(result)
    assert str(parsed_uuid) == result


def test_request_id_from_request_none_id():
    mock_request = Mock()
    mock_request.state.request_id = None
    result = request_id_from_request(mock_request)
    assert result is not None
    assert isinstance(result, str)

    # Verify it is a valid UUID
    parsed_uuid = uuid.UUID(result)
    assert str(parsed_uuid) == result

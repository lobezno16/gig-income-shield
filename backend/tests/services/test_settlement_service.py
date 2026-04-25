import pytest
from unittest.mock import patch
from services.hermes.settlement import _settle_claim_background

@pytest.mark.asyncio
@patch("services.hermes.settlement.logger")
async def test_settle_claim_background_invalid_uuid(mock_logger):
    # Arrange
    invalid_claim_id = "not-a-uuid"

    # Act
    await _settle_claim_background(invalid_claim_id)

    # Assert
    mock_logger.warning.assert_called_once_with(
        "background_settlement_invalid_claim_id", claim_id=invalid_claim_id
    )

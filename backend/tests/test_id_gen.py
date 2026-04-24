import re
from unittest.mock import patch
from datetime import datetime
from services.id_gen import generate_policy_number, generate_claim_number

@patch('services.id_gen.datetime')
@patch('services.id_gen.random.randint')
def test_generate_policy_number(mock_randint, mock_datetime):
    # Setup mocks
    mock_datetime.now.return_value = datetime(2023, 1, 1)
    mock_randint.return_value = 12345

    policy_num = generate_policy_number()

    # Verify exact return value
    assert policy_num == "SOT-2023-012345"
    # Verify format matches regex
    assert re.match(r"^SOT-\d{4}-\d{6}$", policy_num) is not None

    # Verify mock calls
    mock_randint.assert_called_once_with(0, 999999)

@patch('services.id_gen.datetime')
@patch('services.id_gen.random.randint')
def test_generate_claim_number(mock_randint, mock_datetime):
    # Setup mocks
    mock_datetime.now.return_value = datetime(2023, 1, 1)
    mock_randint.return_value = 1234567

    claim_num = generate_claim_number()

    # Verify exact return value
    assert claim_num == "CLM-2023-01234567"
    # Verify format matches regex
    assert re.match(r"^CLM-\d{4}-\d{8}$", claim_num) is not None

    # Verify mock calls
    mock_randint.assert_called_once_with(0, 99999999)

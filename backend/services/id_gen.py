import random
from datetime import datetime


def generate_policy_number() -> str:
    year = datetime.now().year
    return f"SOT-{year}-{random.randint(0, 999999):06d}"


def generate_claim_number() -> str:
    year = datetime.now().year
    return f"CLM-{year}-{random.randint(0, 99999999):08d}"


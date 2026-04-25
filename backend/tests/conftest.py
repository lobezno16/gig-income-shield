from pathlib import Path
import sys
import os

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Set a valid SECRET_KEY for tests
os.environ["SECRET_KEY"] = "test-secret-key-that-is-at-least-32-chars-long"

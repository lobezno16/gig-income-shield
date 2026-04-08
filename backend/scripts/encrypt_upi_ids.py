from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

from sqlalchemy import select

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from crypto import decrypt_field, encrypt_field
from database import AsyncSessionLocal
from models import Worker


def _looks_encrypted(value: str) -> bool:
    try:
        decrypt_field(value)
        return True
    except Exception:
        return False


async def encrypt_existing_upi_ids(dry_run: bool = False) -> tuple[int, int]:
    updated = 0
    skipped = 0
    async with AsyncSessionLocal() as db:
        workers = (await db.execute(select(Worker).where(Worker.upi_id.is_not(None)))).scalars().all()
        for worker in workers:
            if not worker.upi_id:
                skipped += 1
                continue
            if _looks_encrypted(worker.upi_id):
                skipped += 1
                continue
            worker.upi_id = encrypt_field(worker.upi_id)
            updated += 1
        if dry_run:
            await db.rollback()
        else:
            await db.commit()
    return updated, skipped


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Encrypt plaintext UPI IDs in workers table.")
    parser.add_argument("--dry-run", action="store_true", help="Preview changes without writing to the database.")
    return parser.parse_args()


async def _main() -> None:
    args = parse_args()
    updated, skipped = await encrypt_existing_upi_ids(dry_run=args.dry_run)
    mode = "dry-run" if args.dry_run else "applied"
    print(f"UPI encryption migration {mode}: updated={updated} skipped={skipped}")


if __name__ == "__main__":
    asyncio.run(_main())

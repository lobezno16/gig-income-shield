from __future__ import annotations

import argparse
import asyncio
import re
import sys
from pathlib import Path

from sqlalchemy import select

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from constants import H3_ZONES
from database import AsyncSessionLocal
from models import Platform, UserRole, Worker, WorkerTier


async def create_admin(phone: str, name: str) -> Worker:
    if not re.fullmatch(r"^\+91[6-9]\d{9}$", phone):
        raise ValueError("Phone must match +91XXXXXXXXXX format")

    default_hex = next(iter(H3_ZONES.keys()))
    default_city = H3_ZONES[default_hex]["city"]

    async with AsyncSessionLocal() as db:
        worker = (await db.execute(select(Worker).where(Worker.phone == phone))).scalar_one_or_none()
        if worker:
            worker.name = name
            worker.role = UserRole.admin
            worker.is_active = True
        else:
            worker = Worker(
                phone=phone,
                name=name,
                platform=Platform.zepto,
                platform_id=f"ADMIN-{phone[-6:]}",
                city=default_city,
                h3_hex=default_hex,
                upi_id=None,
                tier=WorkerTier.gold,
                active_days_30=30,
                total_deliveries=0,
                trust_score_floor=1.00,
                role=UserRole.admin,
                is_active=True,
            )
            db.add(worker)

        await db.commit()
        await db.refresh(worker)
        return worker


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create or promote an admin account.")
    parser.add_argument("--phone", required=True, help="Phone number in +91XXXXXXXXXX format")
    parser.add_argument("--name", required=True, help='Admin name, e.g. "Admin Name"')
    return parser.parse_args()


async def _main() -> None:
    args = parse_args()
    worker = await create_admin(phone=args.phone, name=args.name)
    print(f"Admin ready: id={worker.id} phone={worker.phone} role={worker.role.value}")


if __name__ == "__main__":
    asyncio.run(_main())

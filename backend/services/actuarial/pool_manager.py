from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import PoolConfig


async def ensure_pool_config(db: AsyncSession, pool_id: str) -> PoolConfig:
    stmt = select(PoolConfig).where(PoolConfig.pool_id == pool_id)
    result = await db.execute(stmt)
    pool = result.scalar_one_or_none()
    if pool:
        return pool

    pool = PoolConfig(pool_id=pool_id, is_enrollment_suspended=False, suspension_reason=None)
    db.add(pool)
    await db.commit()
    await db.refresh(pool)
    return pool


async def set_pool_suspension(db: AsyncSession, pool_id: str, suspended: bool, reason: str | None = None) -> PoolConfig:
    pool = await ensure_pool_config(db, pool_id)
    pool.is_enrollment_suspended = suspended
    pool.suspension_reason = reason
    await db.commit()
    await db.refresh(pool)
    return pool


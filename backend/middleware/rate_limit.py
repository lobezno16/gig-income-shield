from __future__ import annotations

from fastapi import HTTPException, status


class RateLimitExceeded(HTTPException):
    def __init__(self, retry_after_seconds: int) -> None:
        super().__init__(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests",
        )
        self.retry_after_seconds = max(1, int(retry_after_seconds))


async def rate_limit(
    key: str,
    max_requests: int,
    window_seconds: int,
    redis_client,
) -> None:
    current = await redis_client.incr(key)
    if current == 1:
        await redis_client.expire(key, window_seconds)
    if current > max_requests:
        ttl = await redis_client.ttl(key)
        retry_after = ttl if isinstance(ttl, int) and ttl > 0 else window_seconds
        raise RateLimitExceeded(retry_after)

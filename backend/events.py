import asyncio
import json
from collections import defaultdict
from collections.abc import AsyncGenerator
from datetime import datetime, timezone
from typing import Any


class EventBus:
    def __init__(self) -> None:
        self._queues: dict[str, list[asyncio.Queue[dict[str, Any]]]] = defaultdict(list)

    async def publish(self, channel: str, event_type: str, data: dict[str, Any]) -> None:
        payload = {
            "type": event_type,
            "data": data,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        for queue in list(self._queues[channel]):
            await queue.put(payload)

    async def subscribe(self, channel: str) -> AsyncGenerator[str, None]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self._queues[channel].append(queue)
        try:
            while True:
                payload = await queue.get()
                yield f"data: {json.dumps(payload)}\n\n"
        finally:
            self._queues[channel].remove(queue)


event_bus = EventBus()


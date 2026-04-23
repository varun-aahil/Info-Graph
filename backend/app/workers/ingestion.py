from __future__ import annotations

import asyncio
import logging

from sqlalchemy.orm import sessionmaker

from backend.app.services.processing import process_document

logger = logging.getLogger(__name__)


class IngestionQueue:
    def __init__(self, session_factory: sessionmaker) -> None:
        self.session_factory = session_factory
        self.queue: asyncio.Queue[str | None] = asyncio.Queue()
        self.worker_task: asyncio.Task | None = None

    async def start(self) -> None:
        if self.worker_task is None:
            self.worker_task = asyncio.create_task(self._worker_loop())

    async def stop(self) -> None:
        if self.worker_task is None:
            return
        await self.queue.put(None)
        await self.worker_task
        self.worker_task = None

    async def enqueue(self, document_id: str) -> None:
        await self.queue.put(document_id)

    async def _worker_loop(self) -> None:
        while True:
            document_id = await self.queue.get()
            try:
                if document_id is None:
                    return
                await asyncio.to_thread(process_document, self.session_factory, document_id)
            except Exception:
                logger.exception("Failed to process document %s", document_id)
            finally:
                self.queue.task_done()

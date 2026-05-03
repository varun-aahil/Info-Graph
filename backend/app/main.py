from __future__ import annotations

from contextlib import asynccontextmanager
import logging
import os
import sys

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.app.api.router import api_router
from backend.app.core.config import get_settings
from backend.app.core.database import SessionLocal, init_db
from backend.app.workers.ingestion import IngestionQueue

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    queue = None
    try:
        init_db()

        queue = IngestionQueue(SessionLocal)
        await queue.start()
        app.state.ingestion_queue = queue
    except Exception:
        logger.exception("Failed to initialize database or ingestion queue")
        app.state.ingestion_queue = None
    yield

    if queue is not None:
        await queue.stop()


settings = get_settings()
app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api_router, prefix=settings.api_prefix)


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


def _get_base_path() -> str:
    if getattr(sys, "frozen", False):
        return getattr(sys, "_MEIPASS", os.path.abspath("."))
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


_base_path = _get_base_path()
_dist_path = os.path.join(_base_path, "dist")
_assets_path = os.path.join(_dist_path, "assets")

if os.path.isdir(_assets_path):
    app.mount("/assets", StaticFiles(directory=_assets_path), name="assets")


@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    if full_path.startswith(settings.api_prefix.lstrip("/")) or full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="API route not found")

    if not os.path.isdir(_dist_path):
        return {
            "error": "Frontend build not found",
            "hint": "Run 'npm run build' in the project root so the desktop app can load the UI.",
            "looked_in": _dist_path,
        }

    requested_path = os.path.join(_dist_path, full_path)
    if full_path and os.path.isfile(requested_path):
        return FileResponse(requested_path)

    index_path = os.path.join(_dist_path, "index.html")
    if os.path.isfile(index_path):
        return FileResponse(index_path)

    return {
        "error": "Frontend entrypoint missing",
        "hint": "The 'dist/index.html' file was not found.",
        "looked_in": index_path,
    }

from __future__ import annotations

from uuid import uuid4

import structlog
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import get_settings
from logging_config import setup_logging
from response import error_response
from routers import admin, analytics, auth, claims, misc, ml, policy, premium, registration, triggers
from services.sentinelle.trigger_monitor import TriggerMonitor

settings = get_settings()
setup_logging()
logger = structlog.get_logger("soteria-api")
trigger_monitor = TriggerMonitor()


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name, version=settings.api_version)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins + ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def request_id_middleware(request: Request, call_next):
        request_id = request.headers.get("x-request-id", str(uuid4()))
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["x-request-id"] = request_id
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        return error_response(
            code="VALIDATION_ERROR",
            message="Request validation failed.",
            details={"errors": exc.errors()},
            status_code=422,
            request_id=getattr(request.state, "request_id", None),
        )

    @app.exception_handler(Exception)
    async def generic_exception_handler(request: Request, exc: Exception):
        logger.exception("unhandled_error", error=str(exc), path=str(request.url))
        return error_response(
            code="INTERNAL_ERROR",
            message="Internal server error.",
            status_code=500,
            request_id=getattr(request.state, "request_id", None),
        )

    app.include_router(auth.router)
    app.include_router(registration.router)
    app.include_router(policy.router)
    app.include_router(premium.router)
    app.include_router(claims.router)
    app.include_router(triggers.router)
    app.include_router(analytics.router)
    app.include_router(ml.router)
    app.include_router(admin.router)
    app.include_router(misc.router)

    @app.get("/healthz")
    async def healthz():
        return {"ok": True, "service": "soteria-api"}

    @app.on_event("startup")
    async def on_startup():
        logger.info("startup", environment=settings.environment)
        trigger_monitor.start()

    return app


app = create_app()


from __future__ import annotations

from contextlib import asynccontextmanager
from uuid import uuid4

import structlog
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from config import get_settings
from logging_config import setup_logging
from redis_client import close_redis
from response import error_response
from routers import admin, analytics, auth, claims, misc, ml, policy, premium, registration, triggers
from services.sentinelle.trigger_monitor import trigger_monitor

settings = get_settings()
setup_logging()
logger = structlog.get_logger("soteria-api")


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.environment == "production" and "*" in settings.allowed_origins:
        raise RuntimeError("Wildcard CORS origin not permitted in production")
    logger.info("startup", environment=settings.environment)
    trigger_monitor.start()
    yield
    trigger_monitor.stop()
    await close_redis()


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name, version=settings.api_version, lifespan=lifespan)
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
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

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        code = "AUTH_ERROR" if exc.status_code in {401, 403} else "HTTP_ERROR"
        message = str(exc.detail) if isinstance(exc.detail, str) else "Request failed."
        return error_response(
            code=code,
            message=message,
            status_code=exc.status_code,
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
    app.include_router(auth.api_router)
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

    return app


app = create_app()

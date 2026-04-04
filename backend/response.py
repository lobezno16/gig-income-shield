from datetime import datetime, timezone
from uuid import uuid4

from fastapi import Request
from fastapi.responses import JSONResponse

from config import get_settings


def success_response(data: dict, request_id: str | None = None) -> dict:
    settings = get_settings()
    return {
        "success": True,
        "data": data,
        "meta": {
            "request_id": request_id or str(uuid4()),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "version": settings.api_version,
        },
    }


def error_response(
    code: str,
    message: str,
    details: dict | None = None,
    status_code: int = 400,
    request_id: str | None = None,
) -> JSONResponse:
    settings = get_settings()
    return JSONResponse(
        status_code=status_code,
        content={
            "success": False,
            "error": {"code": code, "message": message, "details": details or {}},
            "meta": {
                "request_id": request_id or str(uuid4()),
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "version": settings.api_version,
            },
        },
    )


def request_id_from_request(request: Request) -> str:
    request_id = getattr(request.state, "request_id", None)
    return request_id or str(uuid4())


from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Cookie, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth_utils import create_access_token, create_refresh_token, decode_token
from config import get_settings
from database import get_db
from dependencies import get_current_worker
from models import Policy, PolicyStatus, Worker
from redis_client import get_redis
from response import error_response, request_id_from_request, success_response
from schemas.worker import OtpSendRequest, OtpVerifyRequest
from services.otp_service import (
    OtpExpiredError,
    OtpInvalidTokenError,
    OtpMaxAttemptsError,
    OtpRateLimitError,
    OtpWrongCodeError,
    send_otp,
    verify_otp,
)

router = APIRouter(prefix="/auth", tags=["auth"])
api_router = APIRouter(prefix="/api", tags=["auth"])
settings = get_settings()


def _set_auth_cookies(response: JSONResponse, access_token: str, refresh_token: str) -> None:
    response.set_cookie(
        key="soteria_auth",
        value=access_token,
        httponly=True,
        secure=settings.environment == "production",
        samesite="strict",
        max_age=86400,
        path="/",
    )
    response.set_cookie(
        key="soteria_refresh",
        value=refresh_token,
        httponly=True,
        secure=settings.environment == "production",
        samesite="strict",
        max_age=604800,
        path="/auth",
    )


@router.post("/send-otp")
async def send_otp_endpoint(payload: OtpSendRequest, request: Request, redis_client=Depends(get_redis)):
    request_id = request_id_from_request(request)
    try:
        result = await send_otp(payload.phone, redis_client)
    except OtpRateLimitError as exc:
        response = error_response(
            code="OTP_RATE_LIMITED",
            message="Too many OTP requests. Please try again later.",
            status_code=429,
            request_id=request_id,
        )
        response.headers["Retry-After"] = str(exc.retry_after_seconds)
        return response

    data = {
        "otp_token": result.otp_token,
        "expires_in_seconds": result.expires_in_seconds,
        "issued_at": datetime.now(timezone.utc).isoformat(),
    }
    if result.mock_otp is not None:
        data["mock_otp"] = result.mock_otp

    return success_response(data, request_id=request_id)


@router.post("/verify-otp")
async def verify_otp_endpoint(
    payload: OtpVerifyRequest,
    request: Request,
    redis_client=Depends(get_redis),
    db: AsyncSession = Depends(get_db),
):
    request_id = request_id_from_request(request)
    try:
        await verify_otp(payload.phone, payload.otp, payload.otp_token, redis_client)
    except OtpInvalidTokenError:
        return error_response(
            code="OTP_TOKEN_INVALID",
            message="OTP token is invalid.",
            status_code=401,
            request_id=request_id,
        )
    except OtpExpiredError:
        return error_response(
            code="OTP_EXPIRED",
            message="OTP has expired. Please request a new one.",
            status_code=401,
            request_id=request_id,
        )
    except OtpWrongCodeError:
        return error_response(
            code="INVALID_OTP",
            message="Invalid OTP code.",
            status_code=401,
            request_id=request_id,
        )
    except OtpMaxAttemptsError:
        return error_response(
            code="OTP_MAX_ATTEMPTS",
            message="Maximum OTP verification attempts exceeded. Request a new OTP.",
            status_code=429,
            request_id=request_id,
        )

    worker = (await db.execute(select(Worker).where(Worker.phone == payload.phone))).scalar_one_or_none()
    if not worker:
        return success_response(
            {
                "phone_verified": True,
                "requires_enrollment": True,
                "worker_id": None,
                "name": None,
                "role": "worker",
            },
            request_id=request_id,
        )

    access_token = create_access_token(
        subject=str(worker.id),
        role=worker.role.value,
        phone=worker.phone,
    )
    refresh_token = create_refresh_token(
        subject=str(worker.id),
        role=worker.role.value,
        phone=worker.phone,
    )

    response = JSONResponse(
        content=success_response(
            {
                "worker_id": str(worker.id),
                "name": worker.name,
                "role": worker.role.value,
                "phone_verified": True,
                "requires_enrollment": False,
            },
            request_id=request_id,
        )
    )
    _set_auth_cookies(response, access_token, refresh_token)
    return response


@router.post("/refresh")
async def refresh_auth(
    request: Request,
    refresh_token: str | None = Cookie(default=None, alias="soteria_refresh"),
    db: AsyncSession = Depends(get_db),
):
    request_id = request_id_from_request(request)
    if not refresh_token:
        return error_response(
            code="AUTH_REFRESH_INVALID",
            message="Refresh token is missing or invalid.",
            status_code=401,
            request_id=request_id,
        )

    payload = decode_token(refresh_token, expected_purpose="refresh")
    if not payload or "sub" not in payload:
        return error_response(
            code="AUTH_REFRESH_INVALID",
            message="Refresh token is missing or invalid.",
            status_code=401,
            request_id=request_id,
        )

    try:
        worker_id = UUID(str(payload["sub"]))
    except ValueError:
        return error_response(
            code="AUTH_REFRESH_INVALID",
            message="Refresh token is missing or invalid.",
            status_code=401,
            request_id=request_id,
        )

    worker = (await db.execute(select(Worker).where(Worker.id == worker_id))).scalar_one_or_none()
    if not worker:
        return error_response(
            code="AUTH_REFRESH_INVALID",
            message="Refresh token is missing or invalid.",
            status_code=401,
            request_id=request_id,
        )

    new_access_token = create_access_token(
        subject=str(worker.id),
        role=worker.role.value,
        phone=worker.phone,
    )
    new_refresh_token = create_refresh_token(
        subject=str(worker.id),
        role=worker.role.value,
        phone=worker.phone,
    )
    response = JSONResponse(
        content=success_response(
            {
                "refreshed": True,
                "worker_id": str(worker.id),
                "role": worker.role.value,
            },
            request_id=request_id,
        )
    )
    _set_auth_cookies(response, new_access_token, new_refresh_token)
    return response


@router.post("/logout")
async def logout(request: Request):
    request_id = request_id_from_request(request)
    response = JSONResponse(
        content=success_response(
            {"logged_out": True},
            request_id=request_id,
        )
    )
    response.delete_cookie("soteria_auth", path="/")
    response.delete_cookie("soteria_refresh", path="/auth")
    return response


@api_router.get("/me")
async def get_me(
    request: Request,
    current_worker: Worker = Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    request_id = request_id_from_request(request)
    stmt = (
        select(Worker, Policy)
        .outerjoin(Policy, (Policy.worker_id == Worker.id) & (Policy.status == PolicyStatus.active))
        .where(Worker.id == current_worker.id)
        .order_by(desc(Policy.created_at).nullslast())
        .limit(1)
    )
    row = (await db.execute(stmt)).first()
    if not row:
        return error_response(
            code="WORKER_NOT_FOUND",
            message="Worker not found.",
            status_code=404,
            request_id=request_id,
        )

    worker, policy = row
    data = {
        "id": str(worker.id),
        "name": worker.name,
        "phone": worker.phone,
        "platform": worker.platform.value,
        "city": worker.city,
        "h3_hex": worker.h3_hex,
        "upi_id": worker.upi_id,
        "tier": worker.tier.value,
        "active_days_30": worker.active_days_30,
        "role": worker.role.value,
        "policy": (
            {
                "plan": policy.plan.value,
                "weekly_premium": float(policy.weekly_premium),
                "max_payout_week": float(policy.max_payout_week),
                "policy_number": policy.policy_number,
                "status": policy.status.value,
            }
            if policy
            else None
        ),
    }
    return success_response(data, request_id=request_id)

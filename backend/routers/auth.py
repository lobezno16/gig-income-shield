from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Request

from auth_utils import create_access_token
from response import error_response, request_id_from_request, success_response
from schemas.worker import OtpSendRequest, OtpVerifyRequest

router = APIRouter(prefix="/auth", tags=["auth"])

# In-memory OTP token store for hackathon demo.
OTP_TOKENS: dict[str, str] = {}


@router.post("/send-otp")
async def send_otp(payload: OtpSendRequest, request: Request):
    request_id = request_id_from_request(request)
    otp_token = f"otp-{uuid4()}"
    OTP_TOKENS[payload.phone] = otp_token
    return success_response(
        {
            "otp_token": otp_token,
            "expires_in_seconds": 300,
            "mock_otp_hint": "Use 123456 in non-demo mode.",
            "issued_at": datetime.now(timezone.utc).isoformat(),
        },
        request_id=request_id,
    )


@router.post("/verify-otp")
async def verify_otp(payload: OtpVerifyRequest, request: Request):
    request_id = request_id_from_request(request)
    if payload.phone not in OTP_TOKENS:
        return error_response(
            code="OTP_NOT_SENT",
            message="OTP not requested for this phone number.",
            status_code=400,
            request_id=request_id,
        )

    valid = payload.otp == "123456"
    if payload.demo_mode and len(payload.otp) == 6 and payload.otp.isdigit():
        valid = True

    if not valid:
        return error_response(
            code="INVALID_OTP",
            message="Invalid OTP. Use 123456 in development mode.",
            status_code=401,
            request_id=request_id,
        )

    access_token = create_access_token(subject=payload.phone)
    return success_response({"access_token": access_token, "token_type": "bearer"}, request_id=request_id)


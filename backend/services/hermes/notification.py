from dataclasses import dataclass


@dataclass
class NotificationResult:
    sms_sent: bool
    push_sent: bool
    message: str


async def send_settlement_notification(phone: str, amount: float, upi_ref: str) -> NotificationResult:
    message = f"Soteria payout of Rs {amount:.0f} credited. Ref {upi_ref}."
    _ = phone
    return NotificationResult(sms_sent=True, push_sent=True, message=message)


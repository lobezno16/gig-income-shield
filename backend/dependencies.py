from uuid import UUID

from fastapi import Cookie, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth_utils import decode_token
from database import get_db
from models import UserRole, Worker

security = HTTPBearer(auto_error=False)


async def get_current_worker(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    cookie_token: str | None = Cookie(default=None, alias="soteria_auth"),
    db: AsyncSession = Depends(get_db),
) -> Worker:
    """Validates JWT, returns the Worker ORM object. Raises 401 if invalid."""
    token = credentials.credentials if credentials else cookie_token
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    payload = decode_token(token, expected_purpose="access")
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication credentials")

    subject = payload.get("sub")
    if not subject:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication credentials")

    try:
        worker_id = UUID(str(subject))
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication credentials")

    cached = getattr(request.state, "_auth_worker_cache", None)
    if cached and cached.get("sub") == str(worker_id):
        return cached["worker"]

    worker = (await db.execute(select(Worker).where(Worker.id == worker_id))).scalar_one_or_none()
    if not worker:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication credentials")

    request.state._auth_worker_cache = {"sub": str(worker.id), "worker": worker}

    return worker


async def require_admin(
    worker: Worker = Depends(get_current_worker),
) -> Worker:
    """Raises 403 if worker.role is not admin or superadmin."""
    if worker.role not in {UserRole.admin, UserRole.superadmin}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return worker


async def require_superadmin(
    worker: Worker = Depends(get_current_worker),
) -> Worker:
    """Raises 403 if worker.role is not superadmin."""
    if worker.role != UserRole.superadmin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return worker

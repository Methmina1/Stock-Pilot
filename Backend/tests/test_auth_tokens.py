import asyncio
import uuid

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from jose import jwt

from app.api.v1.endpoints.auth import refresh_token
from app.core.config import settings
from app.core.dependencies import get_current_user
from app.core.security import create_access_token, create_refresh_token
from app.schemas.auth import RefreshRequest


def credentials(token):
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def test_refresh_token_cannot_authorize_api_request():
    token = create_refresh_token(str(uuid.uuid4()))
    with pytest.raises(HTTPException) as error:
        asyncio.run(get_current_user(credentials(token), db=None))
    assert error.value.status_code == 401


def test_malformed_refresh_subject_is_rejected():
    token = jwt.encode(
        {"sub": "not-a-uuid", "type": "refresh"},
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    with pytest.raises(HTTPException) as error:
        asyncio.run(refresh_token(RefreshRequest(refresh_token=token), db=None))
    assert error.value.status_code == 401


def test_access_token_cannot_be_refreshed():
    token = create_access_token(str(uuid.uuid4()))
    with pytest.raises(HTTPException) as error:
        asyncio.run(refresh_token(RefreshRequest(refresh_token=token), db=None))
    assert error.value.status_code == 401

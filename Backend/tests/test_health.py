import asyncio

import pytest
from fastapi import HTTPException

from app.main import health_check


class FailingDatabase:
    async def execute(self, _query):
        raise ConnectionError("private database details")


def test_health_reports_database_failure_without_exposing_details():
    with pytest.raises(HTTPException) as error:
        asyncio.run(health_check(db=FailingDatabase()))
    assert error.value.status_code == 503
    assert "private database details" not in error.value.detail

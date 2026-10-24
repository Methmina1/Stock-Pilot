import asyncio
import math

import pandas as pd

from app.api.v1.endpoints import live
from app.api.v1.endpoints.live import get_market_status, safe_float


def test_market_status_uses_current_regular_hours():
    status = asyncio.run(get_market_status())
    assert isinstance(status["is_open"], bool)
    assert status["is_open"] == status["us"]["is_open"]
    assert isinstance(status["europe"]["is_open"], bool)
    assert isinstance(status["asia"]["is_open"], bool)


def test_non_finite_market_value_is_not_returned_as_json_number():
    assert safe_float(math.nan) is None
    assert safe_float(math.inf) is None


def test_four_hour_chart_downloads_supported_hourly_interval(monkeypatch):
    requested = []
    frame = pd.DataFrame(
        {"Open": [1, 2, 3, 4], "High": [2, 3, 4, 5],
         "Low": [1, 2, 3, 4], "Close": [2, 3, 4, 5], "Volume": [10, 20, 30, 40]},
        index=pd.date_range("2026-10-23 09:00", periods=4, freq="h", tz="America/New_York"),
    )

    class FakeTicker:
        def history(self, *, period, interval):
            requested.append(interval)
            return frame

    monkeypatch.setattr(live.yf, "Ticker", lambda _: FakeTicker())
    result = asyncio.run(live.get_chart_data("TEST", period="1d", interval="4h"))
    assert requested == ["1h"]
    assert result

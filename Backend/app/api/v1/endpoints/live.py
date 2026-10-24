from fastapi import APIRouter, HTTPException, Query
import yfinance as yf
from datetime import datetime, time
from zoneinfo import ZoneInfo
import math

router = APIRouter(prefix="/live", tags=["Live"])

def safe_float(val):
    try:
        number = float(val) if val is not None else None
        return number if number is not None and math.isfinite(number) else None
    except (ValueError, TypeError):
        return None

def safe_int(val):
    try:
        return int(val) if val is not None else None
    except (ValueError, TypeError):
        return None

# ---- Market status ----
@router.get("/market-status")
async def get_market_status():
    def session(zone: str, opens: time, closes: time) -> dict:
        now = datetime.now(ZoneInfo(zone))
        is_open = now.weekday() < 5 and opens <= now.time() < closes
        return {"open": opens.strftime("%H:%M"), "close": closes.strftime("%H:%M"), "is_open": is_open}

    us = session("America/New_York", time(9, 30), time(16))
    return {
        "is_open": us["is_open"],
        "status": "US regular hours" if us["is_open"] else "US market closed",
        "basis": "Weekday regular hours; exchange holidays are not included",
        "us": us,
        "europe": session("Europe/London", time(8), time(16, 30)),
        "asia": session("Asia/Tokyo", time(9), time(15)),
    }

# ---- Quote ----
@router.get("/quote/{ticker}")
async def get_live_quote(ticker: str):
    try:
        t = yf.Ticker(ticker.upper())
        info = t.info or {}
        fi = t.fast_info
        price = safe_float(getattr(fi, "last_price", None))
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Market quote is unavailable") from exc
    if price is None:
        raise HTTPException(status_code=404, detail="No quote for ticker")
    return {
        "ticker": ticker.upper(),
        "price": price,
        "change": safe_float(info.get("regularMarketChange")),
        "change_percent": safe_float(info.get("regularMarketChangePercent")),
        "open": safe_float(getattr(fi, "open", None)),
        "high": safe_float(getattr(fi, "day_high", None)),
        "low": safe_float(getattr(fi, "day_low", None)),
        "previous_close": safe_float(getattr(fi, "previous_close", None)),
        "volume": safe_int(info.get("regularMarketVolume")),
        "market_cap": safe_int(info.get("marketCap")),
        "pe_ratio": safe_float(info.get("trailingPE")),
        "week_52_high": safe_float(getattr(fi, "fifty_two_week_high", None)),
        "week_52_low": safe_float(getattr(fi, "fifty_two_week_low", None)),
    }

# ---- Aliases for frontend ----
@router.get("/{ticker}/quote")
async def get_live_quote_alt(ticker: str):
    return await get_live_quote(ticker)

# ---- Chart (numeric timestamps) ----
@router.get("/chart/{ticker}")
async def get_chart_data(
    ticker: str,
    period: str = Query("6mo"),
    interval: str = Query("1d")
):
    t = yf.Ticker(ticker.upper())
    try:
        data = t.history(period=period, interval="1h" if interval == "4h" else interval)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Chart data is unavailable") from exc
    if data.empty:
        raise HTTPException(status_code=404, detail="No chart data found")
    if interval == "4h":
        data = data.resample('4h').agg({
            "Open": "first",
            "High": "max",
            "Low": "min",
            "Close": "last",
            "Volume": "sum"
        }).dropna()
    result = []
    for idx, row in data.iterrows():
        result.append({
            "time": int(idx.timestamp()),   # ← numeric timestamp (seconds)
            "open": safe_float(row["Open"]),
            "high": safe_float(row["High"]),
            "low": safe_float(row["Low"]),
            "close": safe_float(row["Close"]),
            "volume": safe_int(row["Volume"]),
        })
    return result

@router.get("/{ticker}/chart")
async def get_chart_data_alt(
    ticker: str,
    period: str = Query("6mo"),
    interval: str = Query("1d")
):
    return await get_chart_data(ticker, period, interval)

# ---- Intraday (numeric timestamps) ----
@router.get("/intraday/{ticker}")
async def get_intraday(
    ticker: str,
    interval: str = Query("5m")
):
    t = yf.Ticker(ticker.upper())
    data = t.history(period="1d", interval=interval)
    if data.empty:
        raise HTTPException(status_code=404, detail="No intraday data found")
    result = []
    for idx, row in data.iterrows():
        result.append({
            "time": int(idx.timestamp()),   # ← numeric timestamp (seconds)
            "open": safe_float(row["Open"]),
            "high": safe_float(row["High"]),
            "low": safe_float(row["Low"]),
            "close": safe_float(row["Close"]),
            "volume": safe_int(row["Volume"]),
        })
    return result

@router.get("/{ticker}/intraday")
async def get_intraday_alt(
    ticker: str,
    interval: str = Query("5m")
):
    return await get_intraday(ticker, interval)

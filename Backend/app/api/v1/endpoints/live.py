from fastapi import APIRouter, HTTPException, Query
import yfinance as yf
from datetime import datetime

router = APIRouter(prefix="/live", tags=["Live"])

def safe_float(val):
    try:
        return float(val) if val is not None else None
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
    return {
        "us": {"open": "09:30", "close": "16:00", "is_open": True},
        "europe": {"open": "08:00", "close": "16:30", "is_open": True},
        "asia": {"open": "09:00", "close": "15:00", "is_open": True},
    }

# ---- Quote ----
@router.get("/quote/{ticker}")
async def get_live_quote(ticker: str):
    t = yf.Ticker(ticker.upper())
    info = t.info
    fi = t.fast_info
    return {
        "ticker": ticker.upper(),
        "price": safe_float(getattr(fi, "last_price", None)),
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
    data = t.history(period=period, interval=interval)
    if data.empty:
        raise HTTPException(status_code=404, detail="No chart data found")
    if interval == "4h":
        data = t.history(period=period, interval="1h")
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
"""Dashboard aggregate endpoints — market indices, sector breakdown, portfolio history."""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

import numpy as np
import yfinance as yf
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.db.models.portfolio import Holding
from app.db.models.stock import Stock
from app.db.models.trade import Trade
from app.db.models.user import User
from app.db.session import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/dashboard", tags=["dashboard"])

_indices_cache: dict = {"data": None, "ts": 0}
INDICES_TTL = 120


def _safe_float(val, default=0.0) -> float:
    if val is None:
        return default
    try:
        f = float(val)
        return default if (np.isnan(f) or np.isinf(f)) else f
    except (TypeError, ValueError):
        return default


INDEX_TICKERS = [
    ("^GSPC", "S&P 500"),
    ("^IXIC", "NASDAQ"),
    ("^DJI", "DOW"),
    ("^VIX", "VIX"),
]


@router.get("/market-indices")
async def get_market_indices(_=Depends(get_current_user)):
    now = time.time()
    if _indices_cache["data"] and (now - _indices_cache["ts"]) < INDICES_TTL:
        return _indices_cache["data"]

    out = []
    for symbol, name in INDEX_TICKERS:
        try:
            t = yf.Ticker(symbol)
            info = t.fast_info
            price = _safe_float(getattr(info, "last_price", None))
            prev = _safe_float(getattr(info, "previous_close", None), price)
            change_pct = ((price - prev) / prev * 100) if prev else 0
            out.append({"name": name, "value": round(price, 2), "change": round(change_pct, 2)})
        except Exception:
            out.append({"name": name, "value": 0, "change": 0})

    _indices_cache["data"] = out
    _indices_cache["ts"] = now
    return out


@router.get("/sector-breakdown")
async def get_sector_breakdown(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Holding).where(Holding.user_id == user.id, Holding.closed_at.is_(None))
    )
    holdings = result.scalars().all()
    if not holdings:
        return []

    tickers = [h.ticker for h in holdings]
    stocks_result = await db.execute(select(Stock).where(Stock.ticker.in_(tickers)))
    stock_map = {s.ticker: s for s in stocks_result.scalars().all()}

    sector_totals: dict[str, float] = {}
    total_value = 0.0
    for h in holdings:
        mv = float(h.quantity) * float(h.current_price or h.avg_cost)
        stock = stock_map.get(h.ticker)
        sector = stock.sector if stock else "Other"
        sector_totals[sector] = sector_totals.get(sector, 0) + mv
        total_value += mv

    out = []
    for sector, value in sorted(sector_totals.items(), key=lambda x: -x[1]):
        weight = (value / total_value * 100) if total_value > 0 else 0
        out.append({"sector": sector, "weight": round(weight, 1), "value": round(value, 0)})
    return out


@router.get("/portfolio-history")
async def get_portfolio_history(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Trade).where(Trade.user_id == user.id).order_by(Trade.closed_at.asc())
    )
    trades = result.scalars().all()

    monthly_pnl: dict[str, float] = {}
    for t in trades:
        month = t.closed_at.strftime("%Y-%m")
        pnl = float((t.exit_price - t.entry_price) * t.quantity)
        if t.side == "sell":
            pnl = -pnl
        monthly_pnl[month] = monthly_pnl.get(month, 0) + pnl

    months = sorted(monthly_pnl.keys())
    cumulative = 0.0
    portfolio_points = []
    for m in months:
        cumulative += monthly_pnl[m]
        portfolio_points.append({"date": m, "value": round(cumulative, 2)})

    return {"portfolio": portfolio_points}


@router.get("/batch")
async def get_dashboard_batch(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Single call returning all dashboard data — replaces 3 separate requests."""
    indices = await get_market_indices(user)
    sectors = await get_sector_breakdown(db=db, user=user)
    history = await get_portfolio_history(db=db, user=user)
    return {
        "market_indices": indices,
        "sector_breakdown": sectors,
        "portfolio_history": history,
    }

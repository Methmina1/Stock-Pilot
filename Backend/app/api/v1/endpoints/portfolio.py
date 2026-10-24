import uuid
import asyncio
from concurrent.futures import ThreadPoolExecutor
import yfinance as yf
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.db.models.portfolio import Holding
from app.db.models.stock import Stock
from app.db.models.user import User
from app.schemas.portfolio import HoldingCreate, HoldingUpdate, HoldingOut
from app.core.dependencies import get_current_user

router = APIRouter(prefix="/portfolio", tags=["portfolio"])

_executor = ThreadPoolExecutor(max_workers=4)


def _fetch_price(ticker: str) -> tuple[str, float | None]:
    try:
        t = yf.Ticker(ticker)
        info = t.fast_info
        price = getattr(info, "last_price", None) or getattr(info, "previous_close", None)
        return (ticker, float(price) if price else None)
    except Exception:
        return (ticker, None)


async def _fetch_live_prices(tickers: list[str]) -> dict[str, float]:
    if not tickers:
        return {}
    loop = asyncio.get_event_loop()
    futures = [loop.run_in_executor(_executor, _fetch_price, t) for t in tickers]
    results = await asyncio.gather(*futures)
    return {ticker: price for ticker, price in results if price is not None}


@router.get("")
async def list_holdings(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(
        select(Holding).where(Holding.user_id == user.id, Holding.closed_at.is_(None)).order_by(Holding.opened_at.desc())
    )
    holdings = result.scalars().all()

    tickers = list(set(h.ticker for h in holdings))
    stocks_result = await db.execute(select(Stock).where(Stock.ticker.in_(tickers)))
    stock_map = {s.ticker: s for s in stocks_result.scalars().all()}

    live_prices = await _fetch_live_prices(tickers)

    out = []
    for h in holdings:
        stock = stock_map.get(h.ticker)
        item = HoldingOut.model_validate(h).model_dump(mode="json")
        item["name"] = stock.name if stock else h.ticker
        if h.ticker in live_prices:
            item["current_price"] = live_prices[h.ticker]
        out.append(item)
    return out


@router.post("", response_model=HoldingOut, status_code=201)
async def add_holding(body: HoldingCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    ticker = body.ticker.upper()

    live_prices = await _fetch_live_prices([ticker])
    current_price = live_prices.get(ticker)

    holding = Holding(
        user_id=user.id,
        ticker=ticker,
        quantity=body.quantity,
        avg_cost=body.avg_cost,
        current_price=current_price,
    )
    db.add(holding)
    await db.commit()
    await db.refresh(holding)
    return holding


@router.put("/{holding_id}", response_model=HoldingOut)
async def update_holding(
    holding_id: uuid.UUID,
    body: HoldingUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Holding).where(Holding.id == holding_id, Holding.user_id == user.id))
    holding = result.scalar_one_or_none()
    if holding is None:
        raise HTTPException(status_code=404, detail="Holding not found")
    if body.quantity is not None:
        holding.quantity = body.quantity
    if body.avg_cost is not None:
        holding.avg_cost = body.avg_cost
    await db.commit()
    await db.refresh(holding)
    return holding


@router.delete("/{holding_id}", status_code=204)
async def delete_holding(
    holding_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Holding).where(Holding.id == holding_id, Holding.user_id == user.id))
    holding = result.scalar_one_or_none()
    if holding is None:
        raise HTTPException(status_code=404, detail="Holding not found")
    await db.delete(holding)
    await db.commit()

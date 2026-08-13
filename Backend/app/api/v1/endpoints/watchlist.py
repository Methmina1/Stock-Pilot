from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.db.session import get_db
from app.db.models.watchlist import Watchlist
from app.db.models.user import User
from app.schemas.watchlist import WatchlistAdd, WatchlistOut
from app.core.dependencies import get_current_user

router = APIRouter(prefix="/watchlist", tags=["watchlist"])


@router.get("", response_model=list[WatchlistOut])
async def list_watchlist(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(Watchlist).where(Watchlist.user_id == user.id).order_by(Watchlist.added_at.desc()))
    return result.scalars().all()


@router.post("", response_model=WatchlistOut, status_code=201)
async def add_to_watchlist(body: WatchlistAdd, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    existing = await db.execute(
        select(Watchlist).where(Watchlist.user_id == user.id, Watchlist.ticker == body.ticker.upper())
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Already on watchlist")
    item = Watchlist(user_id=user.id, ticker=body.ticker.upper())
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return item


@router.delete("/{ticker}", status_code=204)
async def remove_from_watchlist(ticker: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(
        select(Watchlist).where(Watchlist.user_id == user.id, Watchlist.ticker == ticker.upper())
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Ticker not on watchlist")
    await db.delete(item)

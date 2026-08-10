from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.db.models.stock import StockOut, PriceHistory
from app.core.dependencies import get_current_user

router = APIRouter(prefix="/stocks", tags=["stocks"])

#get all stocks
@router.get("", response_model=list[StockOut])
async def list_stocks(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(select(Stock).order_by(Stock.ticker))
    return result.scalar().all()

#get a specific stock
@router.get("/{ticker}", response_model=list[StockOut])
async def get_stock(ticker: str, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    resutl = await db.execute(select(Stocks).where(Stock.ticker == ticker.upper()))
    stock = resutl.scalar_one_or_none()
    if stock is None:
        raise HTTPException(status_code=404, detail="Stock not found")
    return stock

#getting the history of a specific stock
@router.get("/{ticker}/history", response_model=list[StockHistoryOut])
async def stock_price_history(ticker: str, days: int = Query(default=90, ge=1, le=365), db: AsyncSession = Depends(get_db),_=Depends(get_current_user)):
    resutl = await db.execute(select(PriceHistory).where(Stock.ticker == ticker.upper()).order_by(PriceHistory.date.desc()).limit(days))
    return result.scalar().all()


import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.db.models.trade import Trade
from app.db.models.user import User
from app.schemas.trade import TradeCreate, TradeOut
from app.core.dependencies import get_current_user

router = APIRouter(prefix="/trades", tags=["trades"])


@router.get("", response_model=list[TradeOut])
async def list_trades(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(
        select(Trade).where(Trade.user_id == user.id).order_by(Trade.closed_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=TradeOut, status_code=201)
async def create_trade(body: TradeCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    trade = Trade(
        user_id=user.id,
        ticker=body.ticker.upper(),
        side=body.side,
        entry_price=body.entry_price,
        exit_price=body.exit_price,
        stop_loss=body.stop_loss,
        take_profit=body.take_profit,
        quantity=body.quantity,
        strategy_label=body.strategy_label,
        opened_at=body.opened_at,
        closed_at=body.closed_at,
        notes=body.notes,
    )
    db.add(trade)
    await db.commit()
    await db.refresh(trade)
    return trade


@router.delete("/{trade_id}", status_code=204)
async def delete_trade(
    trade_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Trade).where(Trade.id == trade_id, Trade.user_id == user.id))
    trade = result.scalar_one_or_none()
    if trade is None:
        raise HTTPException(status_code=404, detail="Trade not found")
    await db.delete(trade)
    await db.commit()

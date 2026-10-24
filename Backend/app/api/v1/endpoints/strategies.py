import uuid
import re
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.db.models.strategy import Strategy
from app.db.models.marketplace import MarketplaceListing, ListingStatus
from app.db.models.user import User, UserRole
from app.db.models.settings import get_settings
from app.schemas.strategy import StrategyCreate, StrategyUpdate, StrategyOut
from app.core.dependencies import get_current_user, require_role
from app.api.v1.endpoints.analysis import run_backtest

router = APIRouter(prefix="/strategies", tags=["strategies"])


@router.get("", response_model=list[StrategyOut])
async def list_strategies(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(
        select(Strategy).where((Strategy.owner_id == user.id) | (Strategy.is_preset == True)).order_by(Strategy.created_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=StrategyOut, status_code=201)
async def create_strategy(body: StrategyCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    strategy = Strategy(owner_id=user.id, name=body.name, description=body.description, weights=body.weights)
    db.add(strategy)
    await db.commit()
    await db.refresh(strategy)
    return strategy


@router.put("/{strategy_id}", response_model=StrategyOut)
async def update_strategy(
    strategy_id: uuid.UUID,
    body: StrategyUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Strategy).where(Strategy.id == strategy_id, Strategy.owner_id == user.id))
    strategy = result.scalar_one_or_none()
    if strategy is None:
        raise HTTPException(status_code=404, detail="Strategy not found")
    if body.name is not None:
        strategy.name = body.name
    if body.description is not None:
        strategy.description = body.description
    if body.weights is not None:
        strategy.weights = body.weights
    await db.commit()
    await db.refresh(strategy)
    return strategy


@router.delete("/{strategy_id}", status_code=204)
async def delete_strategy(
    strategy_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Strategy).where(Strategy.id == strategy_id, Strategy.owner_id == user.id))
    strategy = result.scalar_one_or_none()
    if strategy is None:
        raise HTTPException(status_code=404, detail="Strategy not found")
    await db.delete(strategy)
    await db.commit()


@router.post("/{strategy_id}/publish")
async def request_publish(
    strategy_id: uuid.UUID,
    price_cents: int = Body(default=0, embed=True, ge=0),
    ticker: str = Body(default="", embed=True),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.analyst, UserRole.admin)),
):
    """Submit one of your own strategies for marketplace review.

    Restricted to the analyst and admin roles. The submission is accepted only
    if every backtest threshold is met, and the listing still requires admin
    approval before it becomes publicly visible.
    """
    result = await db.execute(
        select(Strategy).where(Strategy.id == strategy_id, Strategy.owner_id == user.id)
    )
    strategy = result.scalar_one_or_none()
    if strategy is None:
        raise HTTPException(status_code=404, detail="Strategy not found")

    ticker = ticker.strip().upper()
    if not re.fullmatch(r"[A-Z0-9.^-]{1,20}", ticker):
        raise HTTPException(status_code=400, detail="A valid backtest ticker is required")
    keys = ("sentiment", "momentum", "valuation", "volatility", "volume", "growth")
    try:
        weights = {key: float(strategy.weights[key]) for key in keys}
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Strategy has invalid factor weights") from exc
    if any(not 0 <= value <= 100 for value in weights.values()) or sum(weights.values()) <= 0:
        raise HTTPException(status_code=400, detail="Strategy has invalid factor weights")

    backtest = await run_backtest(
        ticker=ticker, period="1y", risk="Moderate", horizon="Medium",
        **{f"w_{key}": value for key, value in weights.items()},
    )
    backtest_trades = backtest["trade_count"]
    backtest_winrate = backtest["win_rate"]
    backtest_sharpe = backtest["sharpe_ratio"]
    backtest_max_drawdown = abs(backtest["max_drawdown_pct"]) / 100
    backtest_profit_factor = backtest["profit_factor"]
    backtest_return = backtest["total_return_pct"] / 100

    thresholds = await get_settings(db)
    min_trades = thresholds.min_trades
    min_winrate = float(thresholds.min_winrate)
    min_sharpe = float(thresholds.min_sharpe)
    max_drawdown = float(thresholds.max_drawdown)
    min_profit_factor = float(thresholds.min_profit_factor)

    failures = []
    if backtest_trades < min_trades:
        failures.append(f"Min trades: {backtest_trades}/{min_trades}")
    if backtest_winrate < min_winrate:
        failures.append(f"Win rate: {backtest_winrate*100:.0f}%/{min_winrate*100:.0f}%")
    if backtest_sharpe < min_sharpe:
        failures.append(f"Sharpe: {backtest_sharpe:.2f}/{min_sharpe:.1f}")
    if backtest_max_drawdown > max_drawdown:
        failures.append(f"Max drawdown: {backtest_max_drawdown*100:.0f}%/{max_drawdown*100:.0f}%")
    if backtest_profit_factor < min_profit_factor:
        failures.append(f"Profit factor: {backtest_profit_factor:.2f}/{min_profit_factor:.1f}")
    if failures:
        raise HTTPException(status_code=400, detail="Backtest thresholds not met: " + "; ".join(failures))

    existing = await db.execute(
        select(MarketplaceListing).where(MarketplaceListing.strategy_id == strategy_id)
    )
    listing = existing.scalar_one_or_none()
    if listing:
        if listing.status == ListingStatus.review:
            raise HTTPException(status_code=400, detail="Already pending review")
        if listing.status == ListingStatus.verified:
            raise HTTPException(status_code=400, detail="Already published")
        listing.status = ListingStatus.review
        listing.price_cents = price_cents
        listing.backtest_return = backtest_return
        listing.backtest_sharpe = backtest_sharpe
        listing.backtest_winrate = backtest_winrate
        listing.backtest_trades = backtest_trades
        listing.backtest_max_drawdown = backtest_max_drawdown
        listing.backtest_profit_factor = backtest_profit_factor
    else:
        listing = MarketplaceListing(
            strategy_id=strategy_id,
            price_cents=price_cents,
            status=ListingStatus.review,
            backtest_return=backtest_return,
            backtest_sharpe=backtest_sharpe,
            backtest_winrate=backtest_winrate,
            backtest_trades=backtest_trades,
            backtest_max_drawdown=backtest_max_drawdown,
            backtest_profit_factor=backtest_profit_factor,
        )
        db.add(listing)

    await db.commit()
    return {"status": "review", "listing_id": str(listing.id)}

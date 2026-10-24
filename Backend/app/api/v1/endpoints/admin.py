import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from app.db.session import get_db
from app.db.models.user import User, UserRole
from app.db.models.strategy import Strategy
from app.db.models.marketplace import MarketplaceListing, ListingStatus
from app.db.models.settings import get_settings, thresholds_dict
from app.core.dependencies import require_role

router = APIRouter(prefix="/admin", tags=["admin"])

require_admin = require_role(UserRole.admin)


@router.get("/thresholds")
async def get_thresholds(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    settings = await get_settings(db)
    return thresholds_dict(settings)


@router.put("/thresholds")
async def update_thresholds(
    min_trades: int = Body(..., embed=True),
    min_winrate: float = Body(..., embed=True),
    min_sharpe: float = Body(..., embed=True),
    max_drawdown: float = Body(..., embed=True),
    min_profit_factor: float = Body(..., embed=True),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    # Basic sanity bounds so a typo can't make the marketplace unusable.
    if not (0 <= min_trades <= 100000):
        raise HTTPException(status_code=400, detail="Min trades must be between 0 and 100000")
    if not (0 <= min_winrate <= 1):
        raise HTTPException(status_code=400, detail="Win rate must be a fraction between 0 and 1")
    if not (0 <= min_sharpe <= 20):
        raise HTTPException(status_code=400, detail="Sharpe must be between 0 and 20")
    if not (0 < max_drawdown <= 1):
        raise HTTPException(status_code=400, detail="Max drawdown must be a fraction between 0 and 1")
    if not (0 <= min_profit_factor <= 100):
        raise HTTPException(status_code=400, detail="Profit factor must be between 0 and 100")

    settings = await get_settings(db)
    settings.min_trades = min_trades
    settings.min_winrate = min_winrate
    settings.min_sharpe = min_sharpe
    settings.max_drawdown = max_drawdown
    settings.min_profit_factor = min_profit_factor
    await db.commit()
    return thresholds_dict(settings)


@router.get("/stats")
async def admin_stats(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    users_count = (await db.execute(select(func.count(User.id)))).scalar()
    strategies_count = (await db.execute(select(func.count(Strategy.id)))).scalar()
    pending_count = (await db.execute(
        select(func.count(MarketplaceListing.id))
        .where(MarketplaceListing.status == ListingStatus.review)
    )).scalar()
    verified_count = (await db.execute(
        select(func.count(MarketplaceListing.id))
        .where(MarketplaceListing.status == ListingStatus.verified)
    )).scalar()

    total_revenue = (await db.execute(
        select(func.coalesce(func.sum(MarketplaceListing.price_cents * MarketplaceListing.sales_count), 0))
        .where(MarketplaceListing.status.in_([ListingStatus.verified, ListingStatus.listed]))
    )).scalar()
    total_sales = (await db.execute(
        select(func.coalesce(func.sum(MarketplaceListing.sales_count), 0))
        .where(MarketplaceListing.status.in_([ListingStatus.verified, ListingStatus.listed]))
    )).scalar()

    return {
        "total_users": users_count,
        "total_strategies": strategies_count,
        "pending_reviews": pending_count,
        "verified_listings": verified_count,
        "total_revenue_cents": total_revenue,
        "total_sales": total_sales,
    }


@router.get("/revenue")
async def admin_revenue(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(
        select(MarketplaceListing)
        .where(
            MarketplaceListing.status.in_([ListingStatus.verified, ListingStatus.listed]),
            MarketplaceListing.sales_count > 0,
        )
        .options(selectinload(MarketplaceListing.strategy).selectinload(Strategy.owner))
        .order_by((MarketplaceListing.price_cents * MarketplaceListing.sales_count).desc())
    )
    listings = result.scalars().all()
    total_revenue = sum(l.price_cents * l.sales_count for l in listings)
    total_sales = sum(l.sales_count for l in listings)

    top_strategies = []
    for l in listings[:10]:
        strat = l.strategy
        top_strategies.append({
            "listing_id": str(l.id),
            "strategy_name": strat.name if strat else "Unknown",
            "creator": strat.owner.full_name if strat and strat.owner else "System",
            "price_cents": l.price_cents,
            "sales_count": l.sales_count,
            "revenue_cents": l.price_cents * l.sales_count,
        })

    return {
        "total_revenue_cents": total_revenue,
        "total_sales": total_sales,
        "top_strategies": top_strategies,
    }


@router.get("/users")
async def list_users(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()
    return [
        {
            "id": str(u.id),
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role.value,
            "is_active": u.is_active,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in users
    ]


@router.patch("/users/{user_id}/role")
async def update_user_role(
    user_id: uuid.UUID,
    role: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot change your own role")
    try:
        new_role = UserRole(role)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid role: {role}")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.role = new_role
    await db.commit()
    return {"id": str(user.id), "role": user.role.value}


@router.get("/pending")
async def list_pending_strategies(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(
        select(MarketplaceListing)
        .where(MarketplaceListing.status == ListingStatus.review)
        .options(selectinload(MarketplaceListing.strategy).selectinload(Strategy.owner))
        .order_by(MarketplaceListing.created_at.desc())
    )
    listings = result.scalars().all()
    return [_listing_dict(l) for l in listings]


@router.get("/listings")
async def list_all_listings(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(
        select(MarketplaceListing)
        .options(selectinload(MarketplaceListing.strategy).selectinload(Strategy.owner))
        .order_by(MarketplaceListing.created_at.desc())
    )
    listings = result.scalars().all()
    return [_listing_dict(l) for l in listings]


@router.post("/listings/{listing_id}/approve")
async def approve_listing(
    listing_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(
        select(MarketplaceListing)
        .where(MarketplaceListing.id == listing_id)
        .options(selectinload(MarketplaceListing.strategy))
    )
    listing = result.scalar_one_or_none()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    if listing.status != ListingStatus.review:
        raise HTTPException(status_code=400, detail="Only listings in review can be approved")
    listing.status = ListingStatus.verified
    listing.listed_at = datetime.now(timezone.utc)
    if listing.strategy:
        listing.strategy.is_published = True
    await db.commit()
    return {"status": "verified"}


@router.post("/listings/{listing_id}/reject")
async def reject_listing(
    listing_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(
        select(MarketplaceListing)
        .where(MarketplaceListing.id == listing_id)
        .options(selectinload(MarketplaceListing.strategy))
    )
    listing = result.scalar_one_or_none()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    if listing.status != ListingStatus.review:
        raise HTTPException(status_code=400, detail="Only listings in review can be rejected")
    listing.status = ListingStatus.removed
    if listing.strategy:
        listing.strategy.is_published = False
    await db.commit()
    return {"status": "removed"}


@router.post("/listings/{listing_id}/remove")
async def remove_listing(
    listing_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(
        select(MarketplaceListing)
        .where(MarketplaceListing.id == listing_id)
        .options(selectinload(MarketplaceListing.strategy))
    )
    listing = result.scalar_one_or_none()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    listing.status = ListingStatus.removed
    if listing.strategy:
        listing.strategy.is_published = False
    await db.commit()
    return {"status": "removed"}


@router.delete("/listings/{listing_id}")
async def delete_listing(
    listing_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(
        select(MarketplaceListing)
        .where(MarketplaceListing.id == listing_id)
        .options(selectinload(MarketplaceListing.strategy))
    )
    listing = result.scalar_one_or_none()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    if listing.strategy:
        listing.strategy.is_published = False
    await db.delete(listing)
    await db.commit()
    return {"status": "deleted"}


@router.get("/strategies")
async def list_all_strategies(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(
        select(Strategy)
        .options(selectinload(Strategy.owner))
        .order_by(Strategy.created_at.desc())
    )
    strategies = result.scalars().all()
    return [
        {
            "id": str(s.id),
            "name": s.name,
            "description": s.description,
            "weights": s.weights,
            "is_preset": s.is_preset,
            "is_published": s.is_published,
            "owner_name": s.owner.full_name if s.owner else "System",
            "owner_email": s.owner.email if s.owner else None,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in strategies
    ]


@router.delete("/strategies/{strategy_id}")
async def delete_strategy(
    strategy_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(
        select(Strategy)
        .where(Strategy.id == strategy_id)
        .options(selectinload(Strategy.listing))
    )
    strategy = result.scalar_one_or_none()
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    if strategy.listing:
        await db.delete(strategy.listing)
    await db.delete(strategy)
    await db.commit()
    return {"status": "deleted"}


@router.patch("/users/{user_id}/status")
async def toggle_user_status(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = not user.is_active
    await db.commit()
    return {"id": str(user.id), "is_active": user.is_active}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.delete(user)
    await db.commit()
    return {"status": "deleted"}


def _listing_dict(listing: MarketplaceListing) -> dict:
    strategy = listing.strategy
    owner_data = None
    if strategy and strategy.owner:
        owner_data = {"full_name": strategy.owner.full_name, "email": strategy.owner.email}
    strat_data = None
    if strategy:
        strat_data = {
            "id": str(strategy.id),
            "name": strategy.name,
            "description": strategy.description,
            "weights": strategy.weights,
            "is_preset": strategy.is_preset,
            "owner": owner_data,
        }
    return {
        "id": str(listing.id),
        "strategy_id": str(listing.strategy_id),
        "price_cents": listing.price_cents,
        "status": listing.status.value if listing.status else "draft",
        "avg_rating": float(listing.avg_rating) if listing.avg_rating else None,
        "rating_count": listing.rating_count,
        "sales_count": listing.sales_count,
        "backtest_return": float(listing.backtest_return) if listing.backtest_return is not None else None,
        "backtest_sharpe": float(listing.backtest_sharpe) if listing.backtest_sharpe is not None else None,
        "backtest_winrate": float(listing.backtest_winrate) if listing.backtest_winrate is not None else None,
        "backtest_trades": listing.backtest_trades,
        "backtest_max_drawdown": float(listing.backtest_max_drawdown) if listing.backtest_max_drawdown is not None else None,
        "backtest_profit_factor": float(listing.backtest_profit_factor) if listing.backtest_profit_factor is not None else None,
        "listed_at": listing.listed_at.isoformat() if listing.listed_at else None,
        "created_at": listing.created_at.isoformat() if listing.created_at else None,
        "strategy": strat_data,
    }

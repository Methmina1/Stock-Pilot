from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.db.models.marketplace import MarketplaceListing, MarketplaceRating, ListingStatus
from app.schemas.marketplace import (
    MarketplaceListingCreate,
    MarketplaceListingUpdate,
    MarketplaceListingResponse,
    MarketplaceListingDetail,
    MarketplaceRatingCreate,
    MarketplaceRatingResponse,
    MarketplaceStats,
)
from app.core.dependencies import get_current_user
from app.db.models.user import User

router = APIRouter(prefix="/marketplace", tags=["marketplace"])


@router.post("/listings", response_model=MarketplaceListingDetail, status_code=status.HTTP_201_CREATED)
async def create_listing(
    listing_in: MarketplaceListingCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new marketplace listing (seller must own the strategy)."""
    from app.db.models.strategy import Strategy
    # FIXED: owner_id instead of user_id
    stmt = select(Strategy).where(Strategy.id == listing_in.strategy_id, Strategy.owner_id == current_user.id)
    strategy = await db.execute(stmt)
    if not strategy.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="You do not own this strategy")

    listing = MarketplaceListing(
        strategy_id=listing_in.strategy_id,
        price_cents=listing_in.price_cents,
        status=ListingStatus.draft,
    )
    db.add(listing)
    await db.commit()
    await db.refresh(listing)
    return listing


@router.get("/listings", response_model=List[MarketplaceListingResponse])
async def list_listings(
    status_filter: Optional[ListingStatus] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """List all marketplace listings with optional status filter."""
    stmt = select(MarketplaceListing).options(selectinload(MarketplaceListing.strategy))
    if status_filter:
        stmt = stmt.where(MarketplaceListing.status == status_filter)
    stmt = stmt.offset(skip).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/listings/{listing_id}", response_model=MarketplaceListingDetail)
async def get_listing_detail(
    listing_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get full details of a single listing (includes ratings)."""
    stmt = (
        select(MarketplaceListing)
        .options(selectinload(MarketplaceListing.strategy))
        .options(selectinload(MarketplaceListing.ratings))
        .where(MarketplaceListing.id == listing_id)
    )
    result = await db.execute(stmt)
    listing = result.scalar_one_or_none()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    return listing


@router.patch("/listings/{listing_id}", response_model=MarketplaceListingResponse)
async def update_listing(
    listing_id: UUID,
    listing_in: MarketplaceListingUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update listing details. Only the seller can update."""
    stmt = select(MarketplaceListing).where(MarketplaceListing.id == listing_id)
    result = await db.execute(stmt)
    listing = result.scalar_one_or_none()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")

    from app.db.models.strategy import Strategy
    strategy_stmt = select(Strategy).where(Strategy.id == listing.strategy_id)
    strategy = await db.execute(strategy_stmt)
    strategy_obj = strategy.scalar_one()
    if strategy_obj.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="You are not the seller")

    update_data = listing_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(listing, key, value)

    await db.commit()
    await db.refresh(listing)
    return listing


@router.delete("/listings/{listing_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_listing(
    listing_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a listing. Only the seller can delete."""
    stmt = select(MarketplaceListing).where(MarketplaceListing.id == listing_id)
    result = await db.execute(stmt)
    listing = result.scalar_one_or_none()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")

    from app.db.models.strategy import Strategy
    strategy_stmt = select(Strategy).where(Strategy.id == listing.strategy_id)
    strategy = await db.execute(strategy_stmt)
    strategy_obj = strategy.scalar_one()
    if strategy_obj.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="You are not the seller")

    await db.delete(listing)
    await db.commit()


@router.post("/listings/{listing_id}/ratings", response_model=MarketplaceRatingResponse, status_code=status.HTTP_201_CREATED)
async def rate_listing(
    listing_id: UUID,
    rating_in: MarketplaceRatingCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Rate a marketplace listing (only buyers who purchased can rate)."""
    stmt = select(MarketplaceListing).where(MarketplaceListing.id == listing_id)
    result = await db.execute(stmt)
    listing = result.scalar_one_or_none()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")

    existing_stmt = select(MarketplaceRating).where(
        MarketplaceRating.listing_id == listing_id,
        MarketplaceRating.user_id == current_user.id,
    )
    existing = await db.execute(existing_stmt)
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="You already rated this listing")

    rating = MarketplaceRating(
        listing_id=listing_id,
        user_id=current_user.id,
        rating=rating_in.rating,
        review=rating_in.review,
    )
    db.add(rating)
    await db.commit()
    await db.refresh(rating)
    return rating


@router.get("/stats", response_model=MarketplaceStats)
async def get_marketplace_stats(
    db: AsyncSession = Depends(get_db),
):
    """Aggregated marketplace stats."""
    total_stmt = select(func.count()).select_from(MarketplaceListing)
    total = await db.execute(total_stmt)

    avg_price_stmt = select(func.avg(MarketplaceListing.price_cents))
    avg_price = await db.execute(avg_price_stmt)

    return MarketplaceStats(
        total_listings=total.scalar() or 0,
        average_price_cents=int(avg_price.scalar() or 0),
    )
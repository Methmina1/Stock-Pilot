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
from app.db.models.strategy import Strategy
from app.db.models.settings import get_settings, thresholds_dict
from app.db.models.user import UserRole
from app.core.dependencies import require_role

router = APIRouter(prefix="/marketplace", tags=["marketplace"])


@router.post("/listings", response_model=MarketplaceListingDetail, status_code=status.HTTP_201_CREATED)
async def create_listing(
    listing_in: MarketplaceListingCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.analyst, UserRole.admin)),
):
    """Create a new marketplace listing (seller must own the strategy)."""
    stmt = select(Strategy).where(Strategy.id == listing_in.strategy_id, Strategy.owner_id == current_user.id)
    strategy = await db.execute(stmt)
    if not strategy.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="You do not own this strategy")

    existing = await db.execute(select(MarketplaceListing.id).where(MarketplaceListing.strategy_id == listing_in.strategy_id))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Strategy already has a listing")

    listing = MarketplaceListing(
        strategy_id=listing_in.strategy_id,
        price_cents=listing_in.price_cents,
        status=ListingStatus.draft,
    )
    db.add(listing)
    await db.commit()
    result = await db.execute(
        select(MarketplaceListing)
        .options(selectinload(MarketplaceListing.strategy).selectinload(Strategy.owner), selectinload(MarketplaceListing.ratings))
        .where(MarketplaceListing.id == listing.id)
    )
    return result.scalar_one()


@router.get("/thresholds")
async def get_public_thresholds(db: AsyncSession = Depends(get_db)):
    return thresholds_dict(await get_settings(db))


@router.get("/listings", response_model=List[MarketplaceListingResponse])
async def list_listings(
    status_filter: Optional[ListingStatus] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """List approved marketplace listings."""
    if status_filter and status_filter not in (ListingStatus.verified, ListingStatus.listed):
        raise HTTPException(status_code=400, detail="Only approved listings are public")
    stmt = select(MarketplaceListing).options(selectinload(MarketplaceListing.strategy).selectinload(Strategy.owner))
    stmt = stmt.where(MarketplaceListing.status.in_([ListingStatus.verified, ListingStatus.listed]))
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
        .options(selectinload(MarketplaceListing.strategy).selectinload(Strategy.owner))
        .options(selectinload(MarketplaceListing.ratings))
        .where(MarketplaceListing.id == listing_id)
    )
    result = await db.execute(stmt)
    listing = result.scalar_one_or_none()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    if listing.status not in (ListingStatus.verified, ListingStatus.listed):
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

    strategy_stmt = select(Strategy).where(Strategy.id == listing.strategy_id)
    strategy = await db.execute(strategy_stmt)
    strategy_obj = strategy.scalar_one()
    if strategy_obj.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="You are not the seller")
    if listing_in.status is not None:
        raise HTTPException(status_code=403, detail="Listing status is managed by administrators")
    if listing.status in (ListingStatus.verified, ListingStatus.listed):
        raise HTTPException(status_code=403, detail="Approved listings cannot be edited")

    update_data = listing_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(listing, key, value)

    await db.commit()
    result = await db.execute(
        select(MarketplaceListing)
        .options(selectinload(MarketplaceListing.strategy).selectinload(Strategy.owner))
        .where(MarketplaceListing.id == listing_id)
    )
    return result.scalar_one()


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

    strategy_stmt = select(Strategy).where(Strategy.id == listing.strategy_id)
    strategy = await db.execute(strategy_stmt)
    strategy_obj = strategy.scalar_one()
    if strategy_obj.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="You are not the seller")
    if listing.status in (ListingStatus.verified, ListingStatus.listed):
        raise HTTPException(status_code=403, detail="Approved listings require administrator removal")

    await db.delete(listing)
    await db.commit()


@router.post("/listings/{listing_id}/ratings", response_model=MarketplaceRatingResponse, status_code=status.HTTP_201_CREATED)
async def rate_listing(
    listing_id: UUID,
    rating_in: MarketplaceRatingCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Rate an approved marketplace listing once per account."""
    stmt = select(MarketplaceListing).where(MarketplaceListing.id == listing_id)
    result = await db.execute(stmt)
    listing = result.scalar_one_or_none()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    if listing.status not in (ListingStatus.verified, ListingStatus.listed):
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
    listing.rating_count = (listing.rating_count or 0) + 1
    listing.avg_rating = ((float(listing.avg_rating or 0) * (listing.rating_count - 1)) + rating_in.rating) / listing.rating_count
    await db.commit()
    await db.refresh(rating)
    return rating


@router.get("/stats", response_model=MarketplaceStats)
async def get_marketplace_stats(
    db: AsyncSession = Depends(get_db),
):
    """Aggregated marketplace stats."""
    approved = (ListingStatus.verified, ListingStatus.listed)
    total_stmt = select(func.count()).select_from(MarketplaceListing).where(MarketplaceListing.status.in_(approved))
    total = await db.execute(total_stmt)

    avg_price_stmt = select(func.avg(MarketplaceListing.price_cents)).where(MarketplaceListing.status.in_(approved))
    avg_price = await db.execute(avg_price_stmt)

    return MarketplaceStats(
        total_listings=total.scalar() or 0,
        average_price_cents=int(avg_price.scalar() or 0),
    )

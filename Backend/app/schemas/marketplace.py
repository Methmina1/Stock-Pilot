import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict

# Import the enum from your models
from app.db.models.marketplace import ListingStatus


# ---------- Your existing schemas (kept as is) ----------
class StrategyOwnerBrief(BaseModel):
    full_name: str

    model_config = {"from_attributes": True}


class StrategyBrief(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None = None
    weights: dict
    is_preset: bool
    owner: StrategyOwnerBrief | None = None

    model_config = {"from_attributes": True}


class MarketplaceListingOut(BaseModel):
    id: uuid.UUID
    strategy_id: uuid.UUID
    price_cents: int
    status: str
    avg_rating: float | None = None
    rating_count: int
    sales_count: int
    backtest_return: float | None = None
    backtest_sharpe: float | None = None
    backtest_winrate: float | None = None
    listed_at: datetime | None = None
    created_at: datetime
    strategy: StrategyBrief | None = None

    model_config = {"from_attributes": True}


# ---------- New schemas required by the endpoint ----------
class MarketplaceListingCreate(BaseModel):
    """Data to create a new listing."""
    strategy_id: uuid.UUID
    price_cents: int = Field(..., ge=0, description="Price in cents")


class MarketplaceListingUpdate(BaseModel):
    """Data to update an existing listing (all optional)."""
    price_cents: Optional[int] = Field(None, ge=0)
    status: Optional[ListingStatus] = None


class MarketplaceListingResponse(MarketplaceListingOut):
    """Basic listing info – used for list endpoints."""
    # Inherits all fields from MarketplaceListingOut
    pass


class MarketplaceListingDetail(MarketplaceListingResponse):
    """Full listing detail, includes ratings."""
    ratings: List["MarketplaceRatingResponse"] = []


class MarketplaceRatingCreate(BaseModel):
    """Data to submit a rating."""
    rating: int = Field(..., ge=1, le=5)
    review: Optional[str] = Field(None, max_length=500)


class MarketplaceRatingResponse(BaseModel):
    """Rating data returned from API."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    listing_id: uuid.UUID
    user_id: uuid.UUID
    rating: int
    review: Optional[str]
    created_at: datetime


class MarketplaceStats(BaseModel):
    """Aggregated marketplace statistics."""
    total_listings: int
    average_price_cents: int
    # Add more fields as needed


# ---------- Resolve forward references ----------
MarketplaceListingDetail.model_rebuild()

import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Numeric, DateTime, func, ForeignKey, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
import enum

class ListingStatus(str, enum.Enum):
    draft       = "draft"
    review      = "review"
    verified    = "verified"
    listed      = "listed"
    removed     = "removed"

class MarketplaceListing(Base):
    __tablename__ = "marketplace_listings"

    id              : Mapped[uuid.UUID]       = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    strategy_id     : Mapped[uuid.UUID]       = mapped_column(UUID(as_uuid=True), ForeignKey("strategies.id"), unique=True, nullable=False)
    price_cents     : Mapped[int]             = mapped_column(Integer, nullable=False, default=0)
    status          : Mapped[ListingStatus]   = mapped_column(SAEnum(ListingStatus), default=ListingStatus.draft, nullable=False)
    avg_rating      : Mapped[float]           = mapped_column(Numeric(3, 2), nullable=True)
    rating_count    : Mapped[int]             = mapped_column(Integer, default=0, nullable=False)
    sales_count     : Mapped[int]             = mapped_column(Integer, default=0, nullable=False)
    backtest_return       : Mapped[float]     = mapped_column(Numeric(6, 3), nullable=True)
    backtest_sharpe       : Mapped[float]     = mapped_column(Numeric(6, 3), nullable=True)
    backtest_winrate      : Mapped[float]     = mapped_column(Numeric(4, 3), nullable=True)
    backtest_trades       : Mapped[int]       = mapped_column(Integer, nullable=True)
    backtest_max_drawdown : Mapped[float]     = mapped_column(Numeric(5, 4), nullable=True)
    backtest_profit_factor: Mapped[float]     = mapped_column(Numeric(5, 2), nullable=True)
    listed_at             : Mapped[datetime]  = mapped_column(DateTime(timezone=True), nullable=True)
    created_at      : Mapped[datetime]        = mapped_column(DateTime(timezone=True), server_default=func.now())

    strategy = relationship("Strategy", back_populates="listing")
    ratings  = relationship("MarketplaceRating", back_populates="listing", cascade="all, delete-orphan")

class MarketplaceRating(Base):
    __tablename__ = "marketplace_ratings"

    id         : Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    listing_id : Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("marketplace_listings.id", ondelete="CASCADE"), nullable=False)
    user_id    : Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id",  ondelete="CASCADE"), nullable=False)
    rating     : Mapped[int]       = mapped_column(Integer, nullable=False)
    review     : Mapped[str]       = mapped_column(String(500), nullable=True)
    created_at : Mapped[datetime]  = mapped_column(DateTime(timezone=True), server_default=func.now())

    listing = relationship("MarketplaceListing", back_populates="ratings")
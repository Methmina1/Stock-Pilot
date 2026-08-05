import uuid
from datetime import datetime
from sqlalchemy import String, Numeric, DateTime, func, ForeignKey, Text, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
import enum

class TradeSide(str, enum.Enum):
    buy  = "buy"
    sell = "sell"

class Trade(Base):
    __tablename__ = "trades"

    id             : Mapped[uuid.UUID]  = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id        : Mapped[uuid.UUID]  = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    ticker         : Mapped[str]        = mapped_column(String(10), nullable=False, index=True)
    side           : Mapped[TradeSide]  = mapped_column(SAEnum(TradeSide), nullable=False)
    entry_price    : Mapped[float]      = mapped_column(Numeric(18, 4), nullable=False)
    exit_price     : Mapped[float]      = mapped_column(Numeric(18, 4), nullable=False)
    stop_loss      : Mapped[float]      = mapped_column(Numeric(18, 4), nullable=True)
    take_profit    : Mapped[float]      = mapped_column(Numeric(18, 4), nullable=True)
    quantity       : Mapped[float]      = mapped_column(Numeric(18, 4), nullable=False)
    strategy_label : Mapped[str]        = mapped_column(String(80), nullable=True)
    opened_at      : Mapped[datetime]   = mapped_column(DateTime(timezone=True), nullable=False)
    closed_at      : Mapped[datetime]   = mapped_column(DateTime(timezone=True), nullable=False)
    notes          : Mapped[str]        = mapped_column(Text, nullable=True)
    created_at     : Mapped[datetime]   = mapped_column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="trades")
import uuid
from datetime import datetime, date
from sqlalchemy import String, Numeric, BigInteger, Date, DateTime, Integer, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

class Stock(Base):
    __tablename__ = "stocks"

    id        : Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ticker    : Mapped[str]       = mapped_column(String(10), unique=True, index=True, nullable=False)
    name      : Mapped[str]       = mapped_column(String(200), nullable=False)
    sector    : Mapped[str]       = mapped_column(String(100), nullable=True)
    industry  : Mapped[str]       = mapped_column(String(100), nullable=True)
    updated_at: Mapped[datetime]  = mapped_column(DateTime(timezone=True), server_default=func.now())

class PriceHistory(Base):
    __tablename__ = "price_history"

    ticker  : Mapped[str]   = mapped_column(String(10), primary_key=True)
    date    : Mapped[date]  = mapped_column(Date, primary_key=True)
    open    : Mapped[float] = mapped_column(Numeric(18, 4), nullable=False)
    high    : Mapped[float] = mapped_column(Numeric(18, 4), nullable=False)
    low     : Mapped[float] = mapped_column(Numeric(18, 4), nullable=False)
    close   : Mapped[float] = mapped_column(Numeric(18, 4), nullable=False)
    volume  : Mapped[int]   = mapped_column(BigInteger, nullable=False)
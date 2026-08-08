import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, func, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

class Strategy(Base):
    __tablename__ = "strategies"

    id           : Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id     : Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    name         : Mapped[str]       = mapped_column(String(80), nullable=False)
    description  : Mapped[str]       = mapped_column(Text, nullable=True)
    weights      : Mapped[dict]      = mapped_column(JSONB, nullable=False)
    is_preset    : Mapped[bool]      = mapped_column(Boolean, default=False, nullable=False)
    is_published : Mapped[bool]      = mapped_column(Boolean, default=False, nullable=False)
    created_at   : Mapped[datetime]  = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at   : Mapped[datetime]  = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    owner   = relationship("User", back_populates="strategies")
    listing = relationship("MarketplaceListing", back_populates="strategy", uselist=False)
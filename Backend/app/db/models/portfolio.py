import uuid
from datetime import datetime
from sqlalchemy import String, Numeric, DateTime, func, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

class Holding(Base):
    __tablename__ = "holdings"

    id         : Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id    : Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    ticker     : Mapped[str]       = mapped_column(String(10), nullable=False)
    quantity   : Mapped[float]     = mapped_column(Numeric(18, 4), nullable=False)
    avg_cost   : Mapped[float]     = mapped_column(Numeric(18, 4), nullable=False)
    current_price : Mapped[float] = mapped_column(Numeric(18, 4), nullable=True)
    opened_at  : Mapped[datetime]  = mapped_column(DateTime(timezone=True), server_default=func.now())
    closed_at  : Mapped[datetime]  = mapped_column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="holdings")
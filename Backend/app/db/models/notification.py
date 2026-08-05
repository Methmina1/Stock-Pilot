import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, func, ForeignKey, Text, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
import enum

class NotificationKind(str, enum.Enum):
    verdict_change  = "verdict_change"
    price_alert     = "price_alert"
    marketplace     = "marketplace"
    weekly_report   = "weekly_report"
    security        = "security"
    system          = "system"

class Notification(Base):
    __tablename__ = "notifications"

    id         : Mapped[uuid.UUID]          = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id    : Mapped[uuid.UUID]          = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    kind       : Mapped[NotificationKind]   = mapped_column(SAEnum(NotificationKind), nullable=False)
    title      : Mapped[str]               = mapped_column(String(200), nullable=False)
    body       : Mapped[str]               = mapped_column(Text, nullable=True)
    is_read    : Mapped[bool]              = mapped_column(Boolean, default=False, nullable=False)
    created_at : Mapped[datetime]          = mapped_column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="notifications")
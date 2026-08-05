import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, func, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
import enum

class UserRole(str, enum.Enum):
    investor = "investor"
    analyst  = "analyst"
    admin    = "admin"

class User(Base):
    __tablename__ = "users"

    id            : Mapped[uuid.UUID]  = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email         : Mapped[str]        = mapped_column(String(320), unique=True, index=True, nullable=False)
    password_hash : Mapped[str]        = mapped_column(String(200), nullable=False)
    full_name     : Mapped[str]        = mapped_column(String(120), nullable=False)
    role          : Mapped[UserRole]   = mapped_column(SAEnum(UserRole), default=UserRole.investor, nullable=False)
    phone         : Mapped[str]        = mapped_column(String(30), nullable=True)
    bio           : Mapped[str]        = mapped_column(String(500), nullable=True)
    avatar_url    : Mapped[str]        = mapped_column(String(500), nullable=True)
    is_active     : Mapped[bool]       = mapped_column(Boolean, default=True, nullable=False)
    created_at    : Mapped[datetime]   = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at    : Mapped[datetime]   = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # relationships
    watchlist     = relationship("Watchlist",    back_populates="user", cascade="all, delete-orphan")
    holdings      = relationship("Holding",      back_populates="user", cascade="all, delete-orphan")
    trades        = relationship("Trade",        back_populates="user", cascade="all, delete-orphan")
    strategies    = relationship("Strategy",     back_populates="owner", cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="user", cascade="all, delete-orphan")
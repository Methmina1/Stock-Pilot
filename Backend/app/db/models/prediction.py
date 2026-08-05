import uuid
from datetime import datetime
from sqlalchemy import String, Numeric, DateTime, Integer, func, ForeignKey, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base
import enum

class SignalType(str, enum.Enum):
    BUY  = "BUY"
    HOLD = "HOLD"
    SELL = "SELL"

class Prediction(Base):
    __tablename__ = "predictions"

    id               : Mapped[uuid.UUID]  = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ticker           : Mapped[str]        = mapped_column(String(10), index=True, nullable=False)
    signal           : Mapped[SignalType] = mapped_column(SAEnum(SignalType), nullable=False)
    confidence       : Mapped[float]      = mapped_column(Numeric(5, 2), nullable=False)
    probability_up   : Mapped[float]      = mapped_column(Numeric(5, 2), nullable=False)
    probability_down : Mapped[float]      = mapped_column(Numeric(5, 2), nullable=False)
    composite_score  : Mapped[int]        = mapped_column(Integer, nullable=True)
    model_version    : Mapped[str]        = mapped_column(String(50), nullable=False, default="xgboost_v1")
    created_at       : Mapped[datetime]   = mapped_column(DateTime(timezone=True), server_default=func.now())
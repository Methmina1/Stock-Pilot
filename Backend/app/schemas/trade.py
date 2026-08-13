import uuid
from datetime import datetime
from pydantic import BaseModel


class TradeCreate(BaseModel):
    ticker: str
    side: str
    entry_price: float
    exit_price: float
    stop_loss: float | None = None
    take_profit: float | None = None
    quantity: float
    strategy_label: str | None = None
    opened_at: datetime
    closed_at: datetime
    notes: str | None = None


class TradeOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    ticker: str
    side: str
    entry_price: float
    exit_price: float
    stop_loss: float | None = None
    take_profit: float | None = None
    quantity: float
    strategy_label: str | None = None
    opened_at: datetime
    closed_at: datetime
    notes: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}

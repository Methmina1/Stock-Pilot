import uuid
from datetime import datetime
from pydantic import BaseModel


class HoldingCreate(BaseModel):
    ticker: str
    quantity: float
    avg_cost: float


class HoldingUpdate(BaseModel):
    quantity: float | None = None
    avg_cost: float | None = None


class HoldingOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    ticker: str
    quantity: float
    avg_cost: float
    current_price: float | None = None
    name: str | None = None
    opened_at: datetime
    closed_at: datetime | None = None

    model_config = {"from_attributes": True}

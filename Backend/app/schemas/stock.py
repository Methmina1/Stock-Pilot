import uuid
from datetime import date, datetime
from pydantic import BaseModel


class StockOut(BaseModel):
    id: uuid.UUID
    ticker: str
    name: str
    sector: str | None = None
    industry: str | None = None

    model_config = {"from_attributes": True}


class PriceHistoryOut(BaseModel):
    ticker: str
    date: date
    open: float
    high: float
    low: float
    close: float
    volume: int

    model_config = {"from_attributes": True}

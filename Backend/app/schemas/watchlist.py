import uuid
from datetime import datetime
from pydantic import BaseModel


class WatchlistAdd(BaseModel):
    ticker: str


class WatchlistOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    ticker: str
    added_at: datetime

    model_config = {"from_attributes": True}

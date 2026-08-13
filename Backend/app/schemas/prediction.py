import uuid
from datetime import datetime
from pydantic import BaseModel


class PredictionOut(BaseModel):
    id: uuid.UUID
    ticker: str
    signal: str
    confidence: float
    probability_up: float
    probability_down: float
    composite_score: int | None = None
    model_version: str
    created_at: datetime

    model_config = {"from_attributes": True}

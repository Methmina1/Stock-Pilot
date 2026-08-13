import uuid
from datetime import datetime
from pydantic import BaseModel


class StrategyCreate(BaseModel):
    name: str
    description: str | None = None
    weights: dict


class StrategyUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    weights: dict | None = None


class StrategyOut(BaseModel):
    id: uuid.UUID
    owner_id: uuid.UUID | None = None
    name: str
    description: str | None = None
    weights: dict
    is_preset: bool
    is_published: bool
    created_at: datetime

    model_config = {"from_attributes": True}

import uuid
from datetime import datetime
from pydantic import BaseModel


class NotificationOut(BaseModel):
    id: uuid.UUID
    kind: str
    title: str
    body: str | None = None
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}

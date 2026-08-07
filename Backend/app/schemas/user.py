import uuid
from datetime import datetime
from pydantic import BaseModel, EmailStr

class UserOut(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str
    role: str
    is_active: bool
    phone: str | None = None
    bio: str | None = None
    avatar_url: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}

class UserUpdate(BaseModel):
    full_name: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    bio: str | None = None


class PasswordUpdate(BaseModel):
    current_password: str
    new_password: str
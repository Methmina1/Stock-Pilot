from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from sqlalchemy import select
from app.db.session import get_db
from app.db.models.user import User
from app.schemas.user import UserOut, UserUpdate, PasswordUpdate
from app.core.dependencies import get_current_user
from app.core.security import verify_password, hash_password

UPLOAD_DIR = Path(__file__).resolve().parents[4] / "uploads" / "avatars"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_SIZE = 2 * 1024 * 1024  # 2 MB

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut)
async def get_me(user: User = Depends(get_current_user)):
    return user


@router.put("/me", response_model=UserOut)
async def update_me(
    body: UserUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.full_name is not None:
        user.full_name = body.full_name
    if body.email is not None:
        email = body.email.lower()
        if email != user.email:
            existing = await db.execute(select(User.id).where(User.email == email))
            if existing.scalar_one_or_none() is not None:
                raise HTTPException(status_code=409, detail="Email already registered")
        user.email = email
    if body.phone is not None:
        user.phone = body.phone
    if body.bio is not None:
        user.bio = body.bio
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Email already registered") from exc
    await db.refresh(user)
    return user


@router.put("/me/password")
async def update_password(
    body: PasswordUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters.")
    user.password_hash = hash_password(body.new_password)
    await db.commit()
    return {"detail": "Password updated successfully."}


@router.post("/me/avatar", response_model=UserOut)
async def upload_avatar(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Only JPG, PNG or WebP images are allowed.")

    data = await file.read()
    if len(data) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="File size must be under 2 MB.")
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        ext = "png"
    elif data.startswith(b"\xff\xd8\xff"):
        ext = "jpg"
    elif data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        ext = "webp"
    else:
        raise HTTPException(status_code=400, detail="Invalid image file.")
    expected_type = {"png": "image/png", "jpg": "image/jpeg", "webp": "image/webp"}[ext]
    if file.content_type != expected_type:
        raise HTTPException(status_code=400, detail="Image type does not match its content.")
    filename = f"{user.id}.{ext}"
    (UPLOAD_DIR / filename).write_bytes(data)

    if user.avatar_url and Path(user.avatar_url).name != filename:
        old_file = UPLOAD_DIR / Path(user.avatar_url).name
        if old_file.exists():
            old_file.unlink()

    user.avatar_url = f"/uploads/avatars/{filename}"
    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/me/avatar", response_model=UserOut)
async def remove_avatar(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.avatar_url:
        old_file = UPLOAD_DIR / Path(user.avatar_url).name
        if old_file.exists():
            old_file.unlink()
        user.avatar_url = None
        await db.commit()
        await db.refresh(user)
    return user

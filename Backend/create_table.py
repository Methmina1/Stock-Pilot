"""Create all database tables from the SQLAlchemy models.
Run once against an empty database. Safe to re-run — existing tables are skipped.
"""
import asyncio
from app.db.session import engine
from app.db.base import Base
import app.db.models  # noqa: F401  — registers every model on Base.metadata


async def main():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()
    print("✅ Tables created.")


if __name__ == "__main__":
    asyncio.run(main())
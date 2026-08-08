import asyncio
from sqlalchemy import text
from app.db.session import engine


async def main():
    async with engine.connect() as conn:
        rows = await conn.execute(text(
            "SELECT tablename FROM pg_tables "
            "WHERE schemaname='public' ORDER BY tablename"
        ))
        tables = [r[0] for r in rows]
    await engine.dispose()
    print("Connected to database:", engine.url.database)
    print("Host / port:", engine.url.host, engine.url.port)
    print("Tables found:", len(tables))
    for t in tables:
        print("  -", t)


if __name__ == "__main__":
    asyncio.run(main())
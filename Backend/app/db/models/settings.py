from sqlalchemy import Integer, Numeric
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class PlatformSettings(Base):
    """Singleton row (id=1) holding admin-configurable platform settings,
    currently the marketplace backtest approval thresholds."""
    __tablename__ = "platform_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)

    # Marketplace publish thresholds
    min_trades:        Mapped[int]   = mapped_column(Integer,        nullable=False, default=100)
    min_winrate:       Mapped[float] = mapped_column(Numeric(4, 3),  nullable=False, default=0.65)
    min_sharpe:        Mapped[float] = mapped_column(Numeric(5, 2),  nullable=False, default=1.0)
    max_drawdown:      Mapped[float] = mapped_column(Numeric(5, 4),  nullable=False, default=0.15)
    min_profit_factor: Mapped[float] = mapped_column(Numeric(5, 2),  nullable=False, default=1.5)


DEFAULT_THRESHOLDS = {
    "min_trades": 100,
    "min_winrate": 0.65,
    "min_sharpe": 1.0,
    "max_drawdown": 0.15,
    "min_profit_factor": 1.5,
}


async def get_settings(db) -> "PlatformSettings":
    """Fetch the singleton settings row, creating it with defaults if absent."""
    settings = await db.get(PlatformSettings, 1)
    if settings is None:
        settings = PlatformSettings(id=1, **DEFAULT_THRESHOLDS)
        db.add(settings)
        await db.flush()
    return settings


def thresholds_dict(settings: "PlatformSettings") -> dict:
    return {
        "min_trades": settings.min_trades,
        "min_winrate": float(settings.min_winrate),
        "min_sharpe": float(settings.min_sharpe),
        "max_drawdown": float(settings.max_drawdown),
        "min_profit_factor": float(settings.min_profit_factor),
    }

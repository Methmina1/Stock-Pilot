"""Seed the database with full demo data for StockPilot."""
import asyncio
from datetime import datetime, timezone, timedelta
from app.db.session import AsyncSessionLocal, engine
from app.db.base import Base
import app.db.models  
from app.db.models.user import User, UserRole
from app.db.models.stock import Stock
from app.db.models.prediction import Prediction, SignalType
from app.db.models.portfolio import Holding
from app.db.models.watchlist import Watchlist
from app.db.models.trade import Trade
from app.db.models.strategy import Strategy
from app.db.models.marketplace import MarketplaceListing, ListingStatus
from app.db.models.notification import Notification, NotificationKind
from app.core.security import hash_password
from sqlalchemy import delete

NOW = datetime.now(timezone.utc)


def dt(year, month, day, hour=9, minute=30):
    return datetime(year, month, day, hour, minute, tzinfo=timezone.utc)


async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        # ── Demo user ──
        demo_user = User(
            email="demo@stockpilot.io",
            password_hash=hash_password("demo1234"),
            full_name="Demo Trader",
            role=UserRole.investor,
        )
        db.add(demo_user)
        await db.flush()
        user_id = demo_user.id

        # ── Admin user ──
        admin_user = User(
            email="admin@stockpilot.io",
            password_hash=hash_password("admin1234"),
            full_name="Admin User",
            role=UserRole.admin,
        )
        db.add(admin_user)
        await db.flush()

        # ── Analyst users ──
        analysts = {}
        for name, email in [
            ("Sarah Chen", "sarah@stockpilot.io"),
            ("James Park", "james@stockpilot.io"),
            ("Alex Rivera", "alex@stockpilot.io"),
        ]:
            u = User(email=email, password_hash=hash_password("analyst1234"), full_name=name, role=UserRole.analyst)
            db.add(u)
            await db.flush()
            analysts[name] = u.id

        # ── Stocks ──
        stocks_data = [
            ("AAPL", "Apple Inc.", "Technology", "Consumer Electronics"),
            ("NVDA", "NVIDIA Corporation", "Technology", "Semiconductors"),
            ("MSFT", "Microsoft Corporation", "Technology", "Software—Infrastructure"),
            ("GOOGL", "Alphabet Inc.", "Communication Services", "Internet Content & Information"),
            ("AMZN", "Amazon.com Inc.", "Consumer Discretionary", "Internet Retail"),
            ("TSLA", "Tesla Inc.", "Consumer Discretionary", "Auto Manufacturers"),
            ("META", "Meta Platforms Inc.", "Communication Services", "Internet Content & Information"),
            ("AMD", "Advanced Micro Devices", "Technology", "Semiconductors"),
            ("PLTR", "Palantir Technologies", "Technology", "Software—Infrastructure"),
            ("COIN", "Coinbase Global Inc.", "Financial Services", "Capital Markets"),
        ]
        for ticker, name, sector, industry in stocks_data:
            db.add(Stock(ticker=ticker, name=name, sector=sector, industry=industry))

        # ── Predictions ──
        predictions_data = [
            ("AAPL", "HOLD", 77, 0.60, 0.40, 60),
            ("NVDA", "BUY", 89, 0.84, 0.16, 84),
            ("MSFT", "BUY", 81, 0.72, 0.28, 72),
            ("GOOGL", "BUY", 78, 0.70, 0.30, 70),
            ("AMZN", "HOLD", 65, 0.55, 0.45, 55),
            ("TSLA", "SELL", 72, 0.35, 0.65, 35),
            ("META", "BUY", 83, 0.75, 0.25, 75),
            ("AMD", "BUY", 74, 0.68, 0.32, 68),
            ("PLTR", "HOLD", 60, 0.52, 0.48, 52),
            ("COIN", "SELL", 68, 0.32, 0.68, 32),
        ]
        for ticker, signal, confidence, prob_up, prob_down, comp in predictions_data:
            db.add(Prediction(
                ticker=ticker,
                signal=SignalType(signal),
                confidence=confidence,
                probability_up=prob_up,
                probability_down=prob_down,
                composite_score=comp,
                model_version="xgboost_v1",
            ))

        # ── Holdings ──
        holdings_data = [
            ("AAPL", 25, 178.50, 312.56),
            ("NVDA", 15, 480.00, 1245.80),
            ("MSFT", 20, 310.00, 467.35),
            ("GOOGL", 12, 135.00, 192.18),
            ("AMZN", 18, 145.00, 213.40),
            ("TSLA", 10, 195.00, 285.70),
        ]
        for ticker, qty, cost, price in holdings_data:
            db.add(Holding(
                user_id=user_id,
                ticker=ticker,
                quantity=qty,
                avg_cost=cost,
                current_price=price,
            ))

        # ── Watchlist ──
        for ticker in ["META", "AMD", "PLTR", "COIN"]:
            db.add(Watchlist(user_id=user_id, ticker=ticker))

        # ── Trades ──
        trades_data = [
            ("NVDA", "buy", 420.00, 502.30, 395.00, 520.00, 10, "Momentum", dt(2025, 12, 2), dt(2025, 12, 18, 15, 45), "Strong breakout above 50-day MA with rising volume. AI score 81."),
            ("AAPL", "buy", 185.20, 198.45, 178.00, 205.00, 20, "Balanced", dt(2026, 1, 8, 10, 15), dt(2026, 1, 22, 14, 30), "Earnings beat expected. Entered on pullback to support."),
            ("TSLA", "buy", 265.00, 242.80, 248.00, 295.00, 8, "Growth", dt(2026, 1, 15), dt(2026, 1, 28, 11, 0), "Stopped out after delivery numbers miss. Lesson: wait for confirmation."),
            ("MSFT", "buy", 388.50, 425.90, 375.00, 440.00, 12, "Balanced", dt(2026, 2, 3, 10, 0), dt(2026, 2, 20, 15, 0), "Cloud revenue growth re-accelerating. Azure momentum."),
            ("AMD", "buy", 155.00, 178.60, 145.00, 185.00, 15, "Momentum", dt(2026, 2, 10, 9, 45), dt(2026, 3, 5, 14, 15), "AI chip demand thesis. Broke resistance at 160."),
            ("META", "buy", 510.00, 485.30, 490.00, 560.00, 6, "Growth", dt(2026, 3, 1, 10, 30), dt(2026, 3, 10), "Stopped out on broad market sell-off. Position was oversized."),
            ("GOOGL", "buy", 158.00, 182.40, 150.00, 190.00, 20, "Balanced", dt(2026, 3, 12), dt(2026, 4, 2, 15, 30), "Gemini AI product launch catalyst. Strong ad revenue growth."),
            ("NVDA", "buy", 780.00, 920.50, 740.00, 950.00, 8, "Momentum", dt(2026, 3, 20, 10, 0), dt(2026, 4, 15, 14, 0), "GTC conference catalyst. Blackwell demand exceeding supply."),
            ("COIN", "sell", 285.00, 258.20, 305.00, 245.00, 10, "Momentum", dt(2026, 4, 5), dt(2026, 4, 18, 11, 0), "Short on crypto weakness. Regulatory headwinds."),
            ("AAPL", "buy", 210.00, 228.50, 200.00, 235.00, 15, "Balanced", dt(2026, 4, 20, 10, 15), dt(2026, 5, 8, 15, 0), "iPhone AI features driving upgrade cycle."),
            ("PLTR", "buy", 24.50, 24.50, 22.00, 28.00, 50, "Growth", dt(2026, 5, 1), dt(2026, 5, 10, 15, 0), "Flat. No catalyst materialized. Closed at breakeven."),
            ("MSFT", "buy", 440.00, 467.35, 425.00, 480.00, 10, "Balanced", dt(2026, 5, 15, 10, 0), dt(2026, 6, 5, 14, 30), "Copilot enterprise adoption accelerating. Strong guidance."),
            ("TSLA", "sell", 310.00, 278.90, 330.00, 270.00, 12, "Momentum", dt(2026, 5, 20), dt(2026, 6, 10, 11, 0), "Short on valuation concerns. Robotaxi delays."),
            ("AMD", "buy", 168.00, 152.40, 155.00, 190.00, 12, "Momentum", dt(2026, 6, 1, 10, 0), dt(2026, 6, 15, 14, 0), "Hit stop loss. Intel gaining ground in data center."),
            ("NVDA", "buy", 1050.00, 1245.80, 980.00, 1300.00, 5, "Momentum", dt(2026, 6, 10), dt(2026, 6, 28, 15, 0), "Earnings blowout. Data center revenue doubled YoY."),
        ]
        for ticker, side, entry, exit_p, sl, tp, qty, strat, opened, closed, notes in trades_data:
            db.add(Trade(
                user_id=user_id,
                ticker=ticker,
                side=side,
                entry_price=entry,
                exit_price=exit_p,
                stop_loss=sl,
                take_profit=tp,
                quantity=qty,
                strategy_label=strat,
                opened_at=opened,
                closed_at=closed,
                notes=notes,
            ))

        # ── Strategies + Marketplace listings ──
        # Weights are research-backed:
        #   Momentum Premium — Jegadeesh & Titman (1993), Asness et al. (2013)
        #   Low-Volatility Alpha — Ang et al. (2006), Baker, Bradley & Wurgler (2011)
        #   Value-Sentiment Contrarian — Fama & French (1992), Tetlock (2007)
        #   Multi-Factor Balanced — Carhart (1997), Asness, Moskowitz & Pedersen (2013)
        strategies_data = [
            ("Momentum Premium", "Sarah Chen",
             "Captures the cross-sectional momentum anomaly (Jegadeesh & Titman 1993). "
             "Volume confirmation filters false breakouts (Gervais et al. 2001).",
             {"sentiment": 10, "momentum": 40, "valuation": 5, "volatility": 10, "volume": 20, "growth": 15},
             2999, "verified", 4.6, 128, 342, 0.34, 1.82, 0.71),
            ("Low-Volatility Alpha", "James Park",
             "Exploits the low-volatility anomaly where safer stocks deliver superior "
             "risk-adjusted returns (Ang et al. 2006, Frazzini & Pedersen 2014 BAB).",
             {"sentiment": 5, "momentum": 15, "valuation": 20, "volatility": 40, "volume": 10, "growth": 10},
             1999, "verified", 4.3, 87, 215, 0.28, 1.65, 0.68),
            ("Value-Sentiment Contrarian", "Alex Rivera",
             "Combines Fama-French value factor with FinBERT sentiment as a timing overlay. "
             "Tetlock (2007) showed news pessimism predicts downward pressure — high sentiment "
             "on undervalued stocks signals mean-reversion entry.",
             {"sentiment": 25, "momentum": 10, "valuation": 35, "volatility": 10, "volume": 5, "growth": 15},
             4999, "verified", 4.8, 64, 178, 0.41, 2.10, 0.73),
            ("Multi-Factor Balanced", None,
             "Diversified factor exposure based on Carhart (1997) four-factor model and "
             "Asness et al. (2013) 'Value and Momentum Everywhere'. Reduces single-factor "
             "drawdown risk through near-equal weighting across uncorrelated premia.",
             {"sentiment": 14, "momentum": 22, "valuation": 20, "volatility": 18, "volume": 10, "growth": 16},
             0, "verified", 4.1, 43, 96, 0.22, 1.35, 0.66),
            ("Volatility Edge", "Sarah Chen",
             "Exploits volatility regime changes by overweighting the low-vol anomaly "
             "with volume confirmation for regime detection.",
             {"sentiment": 5, "momentum": 15, "valuation": 5, "volatility": 45, "volume": 25, "growth": 5},
             3499, "review", 0, 0, 0, None, None, None),
        ]
        for name, owner_name, desc, weights, price, status, rating, r_count, sales, ret, sharpe, winrate in strategies_data:
            owner_id = analysts.get(owner_name) if owner_name else None
            is_preset = owner_name is None
            strat = Strategy(
                owner_id=owner_id,
                name=name,
                description=desc,
                weights=weights,
                is_preset=is_preset,
                is_published=True,
            )
            db.add(strat)
            await db.flush()

            listing = MarketplaceListing(
                strategy_id=strat.id,
                price_cents=price,
                status=ListingStatus(status),
                avg_rating=rating if rating else None,
                rating_count=r_count,
                sales_count=sales,
                backtest_return=ret,
                backtest_sharpe=sharpe,
                backtest_winrate=winrate,
                listed_at=NOW - timedelta(days=30) if status != "review" else None,
            )
            db.add(listing)

        # ── Notifications ──
        notifs = [
            ("verdict_change", "NVDA verdict changed to BUY (89% conviction)", False, NOW - timedelta(hours=2)),
            ("price_alert", "Price alert: TSLA dropped below $280 stop-loss level", False, NOW - timedelta(hours=3)),
            ("marketplace", "New verified strategy \"Value-Sentiment Contrarian\" listed on Marketplace", False, NOW - timedelta(hours=14)),
            ("verdict_change", "AAPL sentiment shift: strong positive news detected", True, NOW - timedelta(hours=20)),
            ("weekly_report", "Weekly report: Portfolio +3.2% vs S&P 500 +0.7%", True, NOW - timedelta(hours=24)),
            ("verdict_change", "GOOGL verdict changed to BUY (78% conviction)", True, NOW - timedelta(days=2)),
            ("system", "Your strategy \"Custom Momentum\" backtest completed", True, NOW - timedelta(days=2, hours=4)),
            ("verdict_change", "AMD earnings report released — sentiment score updated", True, NOW - timedelta(days=3)),
        ]
        for kind, title, is_read, created_at in notifs:
            db.add(Notification(
                user_id=user_id,
                kind=NotificationKind(kind),
                title=title,
                is_read=is_read,
                created_at=created_at,
            ))

        await db.commit()
        print("Seed completed successfully!")
        print(f"  Admin user: admin@stockpilot.io / admin1234")
        print(f"  Demo user: demo@stockpilot.io / demo1234 (id: {user_id})")
        print(f"  {len(stocks_data)} stocks")
        print(f"  {len(predictions_data)} predictions")
        print(f"  {len(holdings_data)} holdings")
        print(f"  4 watchlist entries")
        print(f"  {len(trades_data)} trades")
        print(f"  {len(strategies_data)} strategies + marketplace listings")
        print(f"  {len(notifs)} notifications")


if __name__ == "__main__":
    asyncio.run(seed())

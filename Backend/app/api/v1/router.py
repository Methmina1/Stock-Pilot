from fastapi import APIRouter
from app.api.v1.endpoints import auth, users, stocks, predictions, portfolio, watchlist, trades, strategies, notifications, marketplace, live, analysis, dashboard, sentiment, admin

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(stocks.router)
api_router.include_router(predictions.router)
api_router.include_router(portfolio.router)
api_router.include_router(watchlist.router)
api_router.include_router(trades.router)
api_router.include_router(strategies.router)
api_router.include_router(notifications.router)
api_router.include_router(marketplace.router)
api_router.include_router(live.router)
api_router.include_router(analysis.router)
api_router.include_router(dashboard.router)
api_router.include_router(sentiment.router)
api_router.include_router(admin.router)

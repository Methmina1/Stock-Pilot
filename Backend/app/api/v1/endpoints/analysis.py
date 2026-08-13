from fastapi import APIRouter, HTTPException, Query, Depends
from sqlalchemy.ext.asyncio import AsyncSession
import yfinance as yf
import pandas as pd
import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import List, Optional, Dict, Any
import numpy as np
import vectorbt as vbt
from datetime import datetime, timedelta
from app.services.market_data.fetcher import DataFetcher
from app.services.indicators.featureEngine import FeatureEngine
from app.services.sentiment.finbert import analyze_ticker as finbert_analyze
from app.core.dependencies import get_current_user
from app.db.models.user import User
from app.db.session import get_db

router = APIRouter(prefix="/analysis", tags=["Analysis"])

_executor = ThreadPoolExecutor(max_workers=4)
fetcher = DataFetcher()
engine = FeatureEngine()


def safe_float(val):
    try:
        return float(val) if val is not None else None
    except (ValueError, TypeError):
        return None


# ------------------------ Factor Scoring ------------------------
def compute_six_factors(latest: pd.Series, indicators: pd.DataFrame, ticker: str) -> Dict[str, float]:
    """
    Compute six factor scores 0-100.
    """
    # Momentum
    rsi_part = (latest["RSI_14"] / 100) * 0.4
    macd_part = (0.5 + max(-0.5, min(0.5, latest["MACD_Histogram"] / 2))) * 0.3
    pos_part = latest["Price_Position"] * 0.3
    momentum = max(0, min(100, (rsi_part + macd_part + pos_part) * 100))

    # Volatility (inverted)
    vol_score = 1 - max(0, min(1, (latest["Volatility_20"] * 100) / 5))
    atr_pct = latest["ATR_14"] / latest["Close"] if latest["Close"] != 0 else 0
    atr_score = 1 - max(0, min(1, atr_pct / 0.05))
    volatility = max(0, min(100, ((vol_score + atr_score) / 2) * 100))

    # Volume
    ratio_part = max(0, min(1, latest["Volume_Ratio"] / 2)) * 0.5
    mfi_part = (latest["MFI_14"] / 100) * 0.5
    volume = max(0, min(100, (ratio_part + mfi_part) * 100))

    # Valuation
    bb_score = 1 - latest["BB_Position"]
    sma_spread = (latest["Price_to_SMA_20"] + latest["Price_to_SMA_50"] - 2) / 0.2
    sma_score = 1 - max(-1, min(1, sma_spread)) * 0.5
    valuation = max(0, min(100, ((bb_score + sma_score) / 2) * 100))

    # Growth
    roc_part = max(-1, min(1, latest["ROC_10"] / 20)) * 0.5
    trend_bonus = latest["Price_Above_SMA_20"] * 0.3
    growth = max(0, min(100, ((roc_part + 0.5 + trend_bonus) * 100) / 1.8))

    # Sentiment (use FinBERT, fallback to OBV)
    try:
        sentiment_result = finbert_analyze(ticker, max_headlines=10)
        sentiment = sentiment_result.overall_score
    except Exception:
        # Fallback to OBV trend
        obv = indicators["OBV"]
        if len(obv) >= 20:
            obv_trend = (obv.iloc[-1] - obv.iloc[-20]) / (obv.iloc[-20] + 1)
            sentiment = max(0, min(100, 50 + obv_trend * 50))
        else:
            sentiment = 50.0

    return {
        "momentum": momentum,
        "volatility": volatility,
        "volume": volume,
        "valuation": valuation,
        "growth": growth,
        "sentiment": sentiment,
    }


# ------------------------ Endpoints ------------------------
@router.get("/{ticker}/factors")
async def get_factor_analysis(
    ticker: str,
    w_sentiment: float = Query(14, ge=0, le=100),
    w_momentum: float = Query(22, ge=0, le=100),
    w_valuation: float = Query(20, ge=0, le=100),
    w_volatility: float = Query(18, ge=0, le=100),
    w_volume: float = Query(10, ge=0, le=100),
    w_growth: float = Query(16, ge=0, le=100),
):
    weights = {
        "sentiment": w_sentiment,
        "momentum": w_momentum,
        "valuation": w_valuation,
        "volatility": w_volatility,
        "volume": w_volume,
        "growth": w_growth,
    }
    total_weight = sum(weights.values())
    if total_weight == 0:
        raise HTTPException(status_code=400, detail="Weights must sum to > 0")

    # Fetch data
    raw = fetcher.fetch_historical(ticker, period="6mo")
    if raw.empty:
        raise HTTPException(status_code=404, detail="No data for ticker")
    indicators = engine.calculate_all_features(raw)
    if indicators.empty:
        raise HTTPException(status_code=404, detail="Insufficient data")
    latest = indicators.iloc[-1]

    # Compute scores
    factor_scores = compute_six_factors(latest, indicators, ticker)

    # Composite
    composite = sum(factor_scores[k] * weights[k] for k in weights) / total_weight

    # Verdict
    if composite >= 62:
        verdict = "BUY"
    elif composite <= 38:
        verdict = "SELL"
    else:
        verdict = "HOLD"

    # Build factors list for frontend
    factor_labels = {
        "sentiment": "News Sentiment",
        "momentum": "Technical Momentum",
        "valuation": "Valuation",
        "volatility": "Volatility / Risk",
        "volume": "Volume Trend",
        "growth": "Growth / Fundamentals",
    }
    factors_list = []
    for key in weights:
        score = factor_scores[key]
        signal = "Bullish" if score >= 60 else "Bearish" if score <= 40 else "Neutral"
        factors_list.append({
            "key": key,
            "label": factor_labels.get(key, key.capitalize()),
            "score": round(score, 2),
            "signal": signal,
        })

    return {
        "ticker": ticker.upper(),
        "factors": factors_list,
        "composite_score": round(composite, 2),
        "verdict": verdict,
        "confidence": round(composite, 2) if verdict == "BUY" else round(100 - composite, 2) if verdict == "SELL" else round(
            max(composite, 100 - composite), 2),
        "as_of": datetime.now().isoformat(),
    }


@router.get("/{ticker}/backtest")
async def run_backtest(
        ticker: str,
        period: str = Query(default="1y", pattern="^(6mo|1y|2y|5y)$"),
        risk: str = Query(default="Moderate", pattern="^(Conservative|Moderate|Aggressive)$"),
        horizon: str = Query(default="Medium", pattern="^(Short|Medium|Long)$"),
        w_sentiment: float = Query(14, ge=0, le=100),
        w_momentum: float = Query(22, ge=0, le=100),
        w_valuation: float = Query(20, ge=0, le=100),
        w_volatility: float = Query(18, ge=0, le=100),
        w_volume: float = Query(10, ge=0, le=100),
        w_growth: float = Query(16, ge=0, le=100),
):
    weights = {
        "sentiment": w_sentiment,
        "momentum": w_momentum,
        "valuation": w_valuation,
        "volatility": w_volatility,
        "volume": w_volume,
        "growth": w_growth,
    }
    total_weight = sum(weights.values())
    if total_weight == 0:
        raise HTTPException(status_code=400, detail="Weights must sum to > 0")

    # Fetch data
    raw = fetcher.fetch_historical(ticker, period=period)
    if raw.empty or len(raw) < 60:
        raise HTTPException(status_code=400, detail="Insufficient data (need at least 60 rows)")

    indicators = engine.calculate_all_features(raw)
    if indicators.empty:
        raise HTTPException(status_code=400, detail="Insufficient data after feature engineering")

    def compute_backtest_scores(df):
        scores = {}
        scores["momentum"] = (
            (df["RSI_14"] / 100) * 0.4 +
            (0.5 + np.clip(df["MACD_Histogram"] / 2, -0.5, 0.5)) * 0.3 +
            df["Price_Position"] * 0.3
        ) * 100
        scores["momentum"] = np.clip(scores["momentum"], 0, 100)

        vol_score = 1 - np.clip((df["Volatility_20"] * 100) / 5, 0, 1)
        atr_pct = df["ATR_14"] / df["Close"]
        atr_score = 1 - np.clip(atr_pct / 0.05, 0, 1)
        scores["volatility"] = np.clip(((vol_score + atr_score) / 2) * 100, 0, 100)

        ratio_part = np.clip(df["Volume_Ratio"] / 2, 0, 1) * 0.5
        mfi_part = (df["MFI_14"] / 100) * 0.5
        scores["volume"] = np.clip((ratio_part + mfi_part) * 100, 0, 100)

        bb_score = 1 - df["BB_Position"]
        sma_spread = (df["Price_to_SMA_20"] + df["Price_to_SMA_50"] - 2) / 0.2
        sma_score = 1 - np.clip(sma_spread, -1, 1) * 0.5
        scores["valuation"] = np.clip(((bb_score + sma_score) / 2) * 100, 0, 100)

        roc_part = np.clip(df["ROC_10"] / 20, -1, 1) * 0.5
        trend_bonus = df["Price_Above_SMA_20"] * 0.3
        scores["growth"] = np.clip(((roc_part + 0.5 + trend_bonus) * 100) / 1.8, 0, 100)

        obv = df["OBV"]
        obv_roll = obv.rolling(20, min_periods=1).apply(lambda x: (x.iloc[-1] - x.iloc[0]) / (abs(x.iloc[0]) + 1))
        scores["sentiment"] = np.clip(50 + obv_roll * 50, 0, 100)

        return pd.DataFrame(scores)

    df_scores = compute_backtest_scores(indicators)
    composite_series = sum(df_scores[k] * weights[k] for k in weights) / total_weight

    risk_config = {
        "Conservative": {"buy": 51, "sell": 50, "sl_mult": 0.7, "tp_mult": 0.7},
        "Moderate": {"buy": 53, "sell": 47, "sl_mult": 1.0, "tp_mult": 1.0},
        "Aggressive": {"buy": 50, "sell": 42, "sl_mult": 1.5, "tp_mult": 1.5},
    }
    horizon_config = {
        "Short": {"band": 2, "sl": 2.5, "tp": 2.5},
        "Medium": {"band": 5, "sl": 5, "tp": 10},
        "Long": {"band": 11, "sl": 13, "tp": 0},
    }
    rc = risk_config[risk]
    hc = horizon_config[horizon]

    buy_thresh = rc["buy"]
    sell_thresh = rc["buy"] - hc["band"]
    sl_stop = hc["sl"] * rc["sl_mult"] / 100
    tp_stop = hc["tp"] * rc["tp_mult"] / 100 if hc["tp"] > 0 else 0

    entries = composite_series >= buy_thresh
    exits = composite_series <= sell_thresh

    close = indicators["Close"]
    try:
        portfolio = vbt.Portfolio.from_signals(
            close,
            entries=entries,
            exits=exits,
            sl_stop=sl_stop,
            sl_trail=True,
            tp_stop=tp_stop,
            upon_opposite_entry="close",
            fees=0.001,
            slippage=0.0005,
            init_cash=10000,
            freq="1D"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Backtest simulation failed: {str(e)}")

    total_return = portfolio.total_return() * 100
    buy_hold = (close.iloc[-1] / close.iloc[0] - 1) * 100
    edge = total_return - buy_hold
    trade_count = len(portfolio.trades.records)
    if trade_count > 0:
        win_rate = portfolio.trades.win_rate() * 100
        profit_factor = portfolio.trades.profit_factor()
        profit_factor = 99.99 if np.isinf(profit_factor) else profit_factor
    else:
        win_rate = 0
        profit_factor = 0
    sharpe = portfolio.sharpe_ratio()
    sharpe = 0 if np.isnan(sharpe) else sharpe
    max_drawdown = portfolio.max_drawdown() * 100

    equity = portfolio.value()
    dates = equity.index
    if len(equity) > 100:
        step = len(equity) // 100
        indices = range(0, len(equity), step)
        equity = equity.iloc[indices]
        dates = dates[indices]
    equity_normalized = equity / equity.iloc[0]

    # Trade ledger using .records (stable column names)
    trades_df = portfolio.trades.records
    trade_ledger = []
    if not trades_df.empty:
        for _, row in trades_df.iterrows():
            entry_idx = int(row['entry_idx']) if not pd.isna(row['entry_idx']) else None
            exit_idx = int(row['exit_idx']) if not pd.isna(row['exit_idx']) else None
            entry_date = dates[entry_idx].isoformat() if entry_idx is not None and entry_idx < len(dates) else None
            exit_date = dates[exit_idx].isoformat() if exit_idx is not None and exit_idx < len(dates) else None

            trade_ledger.append({
                "entry_date": entry_date,
                "entry_price": float(row['entry_price']),
                "exit_date": exit_date,
                "exit_price": float(row['exit_price']),
                "size": float(row['size']),
                "pnl": float(row['pnl']),
                "return_pct": float(row['return']),
                "status": row['status'],
            })

    return {
        "total_return_pct": round(total_return, 2),
        "buy_hold_return_pct": round(buy_hold, 2),
        "edge_vs_hold_pct": round(edge, 2),
        "win_rate_pct": round(win_rate, 2),
        "win_rate": round(win_rate / 100, 4),   # frontend reads this (fraction, not %)
        "sharpe_ratio": round(sharpe, 3),
        "sharpe": round(sharpe, 3),             # frontend reads this
        "max_drawdown_pct": round(max_drawdown, 2),
        "profit_factor": round(profit_factor, 2),
        "trade_count": trade_count,
        "trades": trade_count,                  # frontend reads this
        "equity_curve": [round(x, 2) for x in equity_normalized.tolist()],
        "dates": [d.isoformat() for d in dates],
        "trades_log": trade_ledger,
    }


@router.get("/{ticker}/bull-bear")
async def get_bull_bear(ticker: str):
    raw = fetcher.fetch_historical(ticker, period="6mo")
    if raw.empty:
        raise HTTPException(status_code=404, detail="No data")
    indicators = engine.calculate_all_features(raw)
    latest = indicators.iloc[-1]

    bull_points = []
    bear_points = []

    rsi = latest["RSI_14"]
    if rsi < 40:
        bull_points.append(f"RSI at {rsi:.1f} suggests oversold conditions with bounce potential.")
    elif rsi > 70:
        bear_points.append(f"RSI at {rsi:.1f} indicates overbought conditions, pullback risk elevated.")

    if latest["Price_Above_SMA_20"]:
        bull_points.append("Trading above 20-day moving average, short-term trend is up.")
    else:
        bear_points.append("Trading below 20-day moving average, short-term trend is down.")

    if latest["Price_to_SMA_50"] > 1:
        bull_points.append("Price above 50-day MA, medium-term trend positive.")
    else:
        bear_points.append("Price below 50-day MA, medium-term trend negative.")

    return {"bull_cases": bull_points, "bear_cases": bear_points}


@router.get("/{ticker}/fundamentals")
async def get_fundamentals(ticker: str):
    t = yf.Ticker(ticker)
    info = t.info
    if not info:
        raise HTTPException(status_code=404, detail="No fundamental data")

    return {
        "ticker": ticker.upper(),
        "sector": info.get("sector"),
        "industry": info.get("industry"),
        "market_cap": safe_float(info.get("marketCap")),
        "pe_ratio": safe_float(info.get("trailingPE")),
        "forward_pe": safe_float(info.get("forwardPE")),
        "peg_ratio": safe_float(info.get("pegRatio") or info.get("trailingPegRatio")),
        "price_to_book": safe_float(info.get("priceToBook")),
        "eps": safe_float(info.get("trailingEps")),
        "revenue": safe_float(info.get("totalRevenue")),
        "profit_margin": safe_float(info.get("profitMargins")),
        "dividend_yield": safe_float(info.get("dividendYield")),
        "beta": safe_float(info.get("beta")),
        "roe": safe_float(info.get("returnOnEquity")),
        "debt_to_equity": safe_float(info.get("debtToEquity")),
    }
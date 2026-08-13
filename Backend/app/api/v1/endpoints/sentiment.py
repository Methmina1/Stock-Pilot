"""
Sentiment analysis endpoints — FinBERT-powered news sentiment for stocks.
"""

from __future__ import annotations

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.dependencies import get_current_user
from app.services.sentiment.finbert import (
    analyze_ticker,
    SentimentResult as _SentimentResult,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/sentiment", tags=["sentiment"])

_executor = ThreadPoolExecutor(max_workers=2)


class HeadlineOut(BaseModel):
    headline: str
    positive: float
    negative: float
    neutral: float
    label: str
    score: float


class SentimentResponse(BaseModel):
    ticker: str
    overall_score: float
    overall_label: str
    headline_count: int
    positive_count: int
    negative_count: int
    neutral_count: int
    headlines: list[HeadlineOut]


def _run_analysis(ticker: str) -> _SentimentResult:
    return analyze_ticker(ticker)


@router.get("/{ticker}", response_model=SentimentResponse)
async def get_sentiment(ticker: str, _=Depends(get_current_user)):
    """
    Analyze recent news sentiment for a stock ticker using FinBERT.

    Fetches up to 15 recent news headlines from Yahoo Finance, classifies
    each through the ProsusAI/finbert model, and returns per-headline
    scores plus an aggregated overall sentiment score (0-100).
    """
    ticker = ticker.upper()
    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(_executor, _run_analysis, ticker)

        return SentimentResponse(
            ticker=result.ticker,
            overall_score=result.overall_score,
            overall_label=result.overall_label,
            headline_count=result.headline_count,
            positive_count=result.positive_count,
            negative_count=result.negative_count,
            neutral_count=result.neutral_count,
            headlines=[
                HeadlineOut(
                    headline=h.headline,
                    positive=h.positive,
                    negative=h.negative,
                    neutral=h.neutral,
                    label=h.label,
                    score=h.score,
                )
                for h in result.headlines
            ],
        )
    except Exception as exc:
        logger.exception("Sentiment analysis failed for %s", ticker)
        raise HTTPException(
            status_code=502,
            detail=f"Sentiment analysis failed for {ticker}",
        ) from exc

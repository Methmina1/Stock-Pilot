"""
FinBERT Sentiment Analysis Service.

Uses the ProsusAI/finbert model to classify financial text as positive,
negative, or neutral. The model is loaded lazily on first use and cached
for subsequent calls.

Pipeline
--------
1. Fetch recent news headlines for a ticker via yfinance.
2. Run each headline through FinBERT to get sentiment probabilities.
3. Aggregate into a single sentiment score (0-100) and per-headline details.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Optional

import yfinance as yf

logger = logging.getLogger(__name__)

_pipeline = None
_LABEL_MAP = {"positive": 1.0, "neutral": 0.5, "negative": 0.0}


def _get_pipeline():
    """Lazy-load the FinBERT pipeline. Downloads the model on first call (~420 MB)."""
    global _pipeline
    if _pipeline is None:
        from transformers import pipeline as hf_pipeline

        logger.info("Loading FinBERT model (first call — this may take a moment)...")
        _pipeline = hf_pipeline(
            "sentiment-analysis",
            model="ProsusAI/finbert",
            tokenizer="ProsusAI/finbert",
            top_k=None,
            truncation=True,
            max_length=512,
        )
        logger.info("FinBERT model loaded successfully")
    return _pipeline


@dataclass
class HeadlineSentiment:
    """Sentiment result for a single headline."""
    headline: str
    positive: float
    negative: float
    neutral: float
    label: str
    score: float


@dataclass
class SentimentResult:
    """Aggregated sentiment analysis for a ticker."""
    ticker: str
    overall_score: float
    overall_label: str
    headline_count: int
    positive_count: int
    negative_count: int
    neutral_count: int
    headlines: list[HeadlineSentiment] = field(default_factory=list)


def fetch_news_headlines(ticker: str, max_headlines: int = 15) -> list[str]:
    """
    Fetch recent news headlines for a ticker from Yahoo Finance.

    yfinance's .news property returns a list of dicts with 'title', 'link',
    'publisher', 'providerPublishTime', etc. We extract just the titles.
    """
    try:
        stock = yf.Ticker(ticker)
        news = stock.news or []
        headlines = []
        for item in news[:max_headlines]:
            title = ""
            if isinstance(item, dict):
                content = item.get("content", {})
                if isinstance(content, dict):
                    title = content.get("title", "")
                if not title:
                    title = item.get("title", "")
            if title:
                headlines.append(title)
        return headlines
    except Exception as exc:
        logger.warning("Failed to fetch news for %s: %s", ticker, exc)
        return []


def analyze_headline(text: str) -> HeadlineSentiment:
    """
    Run a single headline through FinBERT.

    Returns a HeadlineSentiment with probabilities for each class and the
    dominant label.
    """
    pipe = _get_pipeline()
    results = pipe(text)

    probs = {"positive": 0.0, "negative": 0.0, "neutral": 0.0}
    if results and isinstance(results[0], list):
        for item in results[0]:
            probs[item["label"]] = round(item["score"], 4)
    elif results:
        for item in results:
            probs[item["label"]] = round(item["score"], 4)

    best_label = max(probs, key=probs.get)
    score = probs["positive"] * 100 + probs["neutral"] * 50

    return HeadlineSentiment(
        headline=text,
        positive=probs["positive"],
        negative=probs["negative"],
        neutral=probs["neutral"],
        label=best_label,
        score=round(score, 2),
    )


def analyze_ticker(ticker: str, max_headlines: int = 15) -> SentimentResult:
    """
    Full sentiment analysis pipeline for a stock ticker.

    1. Fetches recent news headlines from Yahoo Finance.
    2. Classifies each headline with FinBERT (positive/negative/neutral).
    3. Aggregates into an overall sentiment score (0-100).
       - 100 = all headlines strongly positive
       - 50  = neutral / mixed
       - 0   = all headlines strongly negative
    """
    ticker = ticker.upper()
    headlines = fetch_news_headlines(ticker, max_headlines)

    if not headlines:
        return SentimentResult(
            ticker=ticker,
            overall_score=50.0,
            overall_label="neutral",
            headline_count=0,
            positive_count=0,
            negative_count=0,
            neutral_count=0,
        )

    results = []
    for hl in headlines:
        try:
            result = analyze_headline(hl)
            results.append(result)
        except Exception as exc:
            logger.warning("FinBERT failed on headline '%s': %s", hl[:50], exc)

    if not results:
        return SentimentResult(
            ticker=ticker,
            overall_score=50.0,
            overall_label="neutral",
            headline_count=0,
            positive_count=0,
            negative_count=0,
            neutral_count=0,
        )

    pos_count = sum(1 for r in results if r.label == "positive")
    neg_count = sum(1 for r in results if r.label == "negative")
    neu_count = sum(1 for r in results if r.label == "neutral")

    overall_score = sum(r.score for r in results) / len(results)

    if overall_score >= 62:
        overall_label = "positive"
    elif overall_score <= 38:
        overall_label = "negative"
    else:
        overall_label = "neutral"

    return SentimentResult(
        ticker=ticker,
        overall_score=round(overall_score, 2),
        overall_label=overall_label,
        headline_count=len(results),
        positive_count=pos_count,
        negative_count=neg_count,
        neutral_count=neu_count,
        headlines=results,
    )

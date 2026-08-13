"""
Feature Engineering Module.

Computes technical indicators from OHLCV data and produces a clean feature
matrix ready for machine-learning models.

Key correctness properties:
    * ``validate_data`` returns a copy; it never mutates the caller's DataFrame.
    * NaN handling drops the warmup window instead of back-filling. Back-filling
      an indicator with a future value is look-ahead bias.
    * Every indicator is computed from a rolling window that only ever looks
      backward from the current row.
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional

import numpy as np
import pandas as pd
from ta.momentum import RSIIndicator
from ta.trend import MACD
from ta.volatility import AverageTrueRange, BollingerBands
from ta.volume import MFIIndicator, OnBalanceVolumeIndicator

logger = logging.getLogger(__name__)

# columns that are NOT features (metadata or raw OHLCV)
_NON_FEATURE_COLS = {"Open", "High", "Low", "Close", "Volume", "Ticker"}

# how many rows the longest-window indicator needs to warm up
# (SMA/EMA_200 is optional and gated; without it, MACD's 26-slow + 9-signal ~= 35)
_MIN_ROWS_WITHOUT_SMA200 = 35
_MIN_ROWS_WITH_SMA200 = 200


class FeatureEngine:
    """
    Compute technical indicators for a single ticker's OHLCV history.

    Usage
    -----
    ::

        engine = FeatureEngine()
        features = engine.calculate_all_features(raw_ohlcv)

    Attributes
    ----------
    data : pd.DataFrame | None
        Last validated OHLCV frame.
    features : pd.DataFrame | None
        Last-produced feature matrix (indicators + OHLCV).
    feature_columns : list[str]
        Names of the indicator columns (excludes OHLCV / metadata).
    """

    def __init__(
        self,
        data: Optional[pd.DataFrame] = None,
        include_sma_200: bool = False,
    ) -> None:
        self.data: Optional[pd.DataFrame] = None
        self.features: Optional[pd.DataFrame] = None
        self.feature_columns: List[str] = []
        self.include_sma_200 = include_sma_200

        if data is not None:
            self.data = self._validate(data)

    # ==================================================================
    # validation (does NOT mutate the input)
    # ==================================================================

    def _validate(self, data: pd.DataFrame) -> pd.DataFrame:
        """
        Return a *copy* of ``data`` with canonical OHLCV column names, or raise.

        Left as an underscore-prefixed method to signal "internal, side-effect-free".
        """
        if data is None or data.empty:
            raise ValueError("data is empty")

        df = data.copy()

        # Flatten a MultiIndex from single-ticker yfinance downloads.
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = ["_".join(str(part) for part in col if part).strip() for col in df.columns.values]

        required = ["Open", "High", "Low", "Close", "Volume"]
        rename_map: Dict[str, str] = {}
        for target in required:
            if target in df.columns:
                continue
            for col in df.columns:
                if col.lower() == target.lower():
                    rename_map[col] = target
                    break
                if col.endswith(f"_{target}") or col.startswith(f"{target}_"):
                    rename_map[col] = target
                    break

        if rename_map:
            df = df.rename(columns=rename_map)

        missing = [c for c in required if c not in df.columns]
        if missing:
            raise ValueError(f"missing required columns {missing}; got {list(df.columns)}")

        min_rows = _MIN_ROWS_WITH_SMA200 if self.include_sma_200 else _MIN_ROWS_WITHOUT_SMA200
        if len(df) < min_rows:
            raise ValueError(f"insufficient rows: {len(df)} (need at least {min_rows})")

        # Coerce numeric columns to float64 to avoid pandas warnings on rolling ops
        for col in required:
            df[col] = pd.to_numeric(df[col], errors="coerce")

        return df

    # Kept for backwards-compat with existing callers.
    def validate_data(self, data: pd.DataFrame) -> None:
        """Validate ``data`` and store the sanitised copy on ``self.data``."""
        self.data = self._validate(data)

    # ==================================================================
    # indicator methods (each returns a *new* DataFrame)
    # ==================================================================

    def calculate_moving_averages(self, data: pd.DataFrame) -> pd.DataFrame:
        """Simple and exponential moving averages for periods 5, 10, 20, 50 (and optionally 200)."""
        df = data.copy()
        periods = [5, 10, 20, 50] + ([200] if self.include_sma_200 else [])
        for p in periods:
            df[f"SMA_{p}"] = df["Close"].rolling(window=p, min_periods=p).mean()
            df[f"EMA_{p}"] = df["Close"].ewm(span=p, adjust=False, min_periods=p).mean()
        return df

    def calculate_rsi(self, data: pd.DataFrame) -> pd.DataFrame:
        """14-period RSI."""
        df = data.copy()
        df["RSI_14"] = RSIIndicator(df["Close"], window=14).rsi()
        return df

    def calculate_macd(self, data: pd.DataFrame) -> pd.DataFrame:
        """MACD line, signal line, and histogram."""
        df = data.copy()
        macd = MACD(df["Close"])
        df["MACD"] = macd.macd()
        df["MACD_Signal"] = macd.macd_signal()
        df["MACD_Histogram"] = macd.macd_diff()
        return df

    def calculate_bollinger_bands(self, data: pd.DataFrame) -> pd.DataFrame:
        """20-period, 2-sigma Bollinger bands plus width and position."""
        df = data.copy()
        bb = BollingerBands(df["Close"], window=20, window_dev=2)
        df["BB_High"] = bb.bollinger_hband()
        df["BB_Mid"] = bb.bollinger_mavg()
        df["BB_Low"] = bb.bollinger_lband()
        df["BB_Width"] = bb.bollinger_wband()
        df["BB_Position"] = bb.bollinger_pband()
        return df

    def calculate_volume_indicators(self, data: pd.DataFrame) -> pd.DataFrame:
        """
        VWAP (rolling, so it resets over long histories rather than growing unboundedly),
        OBV, 20-day volume ratio, and 14-period MFI.
        """
        df = data.copy()

        # Rolling 20-day VWAP — the original cumulative VWAP is unbounded over long
        # histories and drifts away from the current price. Rolling is more usable.
        typical_price = (df["High"] + df["Low"] + df["Close"]) / 3.0
        pv = typical_price * df["Volume"]
        df["VWAP_20"] = pv.rolling(20, min_periods=20).sum() / df["Volume"].rolling(20, min_periods=20).sum()

        df["OBV"] = OnBalanceVolumeIndicator(df["Close"], df["Volume"]).on_balance_volume()
        df["Volume_Ratio"] = df["Volume"] / df["Volume"].rolling(20, min_periods=20).mean()

        df["MFI_14"] = MFIIndicator(
            high=df["High"],
            low=df["Low"],
            close=df["Close"],
            volume=df["Volume"],
            window=14,
        ).money_flow_index()

        return df

    def calculate_volatility(self, data: pd.DataFrame) -> pd.DataFrame:
        """ATR, daily return, 20-day rolling volatility, and simple candle ratios."""
        df = data.copy()
        df["ATR_14"] = AverageTrueRange(df["High"], df["Low"], df["Close"], window=14).average_true_range()
        df["Daily_Return"] = df["Close"].pct_change()
        df["Volatility_20"] = df["Daily_Return"].rolling(20, min_periods=20).std()
        df["High_Low_Ratio"] = df["High"] / df["Low"].replace(0, np.nan)
        df["Close_Open_Ratio"] = df["Close"] / df["Open"].replace(0, np.nan)
        return df

    def calculate_price_position(self, data: pd.DataFrame) -> pd.DataFrame:
        """
        Where the current price sits in the 20-day range, 10-day rate-of-change,
        price/moving-average ratios, and a binary above/below flag.

        Requires ``SMA_20`` and ``SMA_50`` — call after :py:meth:`calculate_moving_averages`.
        """
        if "SMA_20" not in data.columns or "SMA_50" not in data.columns:
            raise ValueError(
                "calculate_price_position requires SMA_20 and SMA_50; "
                "call calculate_moving_averages first"
            )
        df = data.copy()

        low_20 = df["Low"].rolling(20, min_periods=20).min()
        high_20 = df["High"].rolling(20, min_periods=20).max()
        span_20 = (high_20 - low_20).replace(0, np.nan)
        df["Price_Position"] = (df["Close"] - low_20) / span_20

        prev_close_10 = df["Close"].shift(10)
        df["ROC_10"] = (df["Close"] - prev_close_10) / prev_close_10 * 100

        df["Price_to_SMA_20"] = df["Close"] / df["SMA_20"]
        df["Price_to_SMA_50"] = df["Close"] / df["SMA_50"]
        df["Price_Above_SMA_20"] = (df["Close"] > df["SMA_20"]).astype(int)

        return df

    # ==================================================================
    # NaN handling — trim the warmup, never back-fill
    # ==================================================================

    def handle_nan_values(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Drop the leading rows where indicators are still warming up.

        NOT a general "fill missing values" function.

        Rationale
        ---------
        The original implementation used ``ffill().bfill().dropna()``.
        ``bfill`` is look-ahead bias: it fills an early NaN with a value from a
        later row, i.e. from the future. That inflates training accuracy in a
        way that never survives contact with live data.

        Instead we detect the first row where every indicator is finite and drop
        everything before it. This preserves temporal integrity.
        """
        initial = len(df)

        # Any indicator columns (not the raw OHLCV / metadata)
        indicator_cols = [c for c in df.columns if c not in _NON_FEATURE_COLS]
        if not indicator_cols:
            return df

        # First row where every indicator is finite
        all_finite = df[indicator_cols].notna().all(axis=1)
        if not all_finite.any():
            logger.warning("no row has all indicators finite; the input may be too short")
            return df.iloc[0:0]

        first_good = all_finite.idxmax()
        cleaned = df.loc[first_good:].copy()

        # A tiny bit of forward-fill *within* the usable window is defensible
        # (holidays / single-day gaps). No bfill, ever.
        cleaned = cleaned.ffill().dropna(subset=indicator_cols)

        removed = initial - len(cleaned)
        if removed > 0:
            logger.debug("trimmed %d warmup rows", removed)
        return cleaned

    # ==================================================================
    # top-level pipeline
    # ==================================================================

    def calculate_all_features(self, data: pd.DataFrame) -> pd.DataFrame:
        """Run every indicator, trim the warmup, cache the result on ``self``."""
        df = self._validate(data)
        df = self.calculate_moving_averages(df)
        df = self.calculate_rsi(df)
        df = self.calculate_macd(df)
        df = self.calculate_bollinger_bands(df)
        df = self.calculate_volume_indicators(df)
        df = self.calculate_volatility(df)
        df = self.calculate_price_position(df)
        df = self.handle_nan_values(df)

        self.data = df[[c for c in df.columns if c in _NON_FEATURE_COLS]]
        self.features = df
        self.feature_columns = [c for c in df.columns if c not in _NON_FEATURE_COLS]

        logger.info("computed %d features across %d rows", len(self.feature_columns), len(df))
        return df

    # ==================================================================
    # introspection
    # ==================================================================

    def get_feature_names(self) -> List[str]:
        return list(self.feature_columns)

    def get_feature_summary(self) -> pd.DataFrame:
        if self.features is None or not self.feature_columns:
            return pd.DataFrame()
        return self.features[self.feature_columns].describe()

    def get_feature_correlation(self, method: str = "pearson") -> pd.DataFrame:
        if self.features is None or not self.feature_columns:
            return pd.DataFrame()
        return self.features[self.feature_columns].corr(method=method)

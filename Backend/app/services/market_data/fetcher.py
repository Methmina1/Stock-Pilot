"""
Data Fetcher Module.

Downloads historical stock data from Yahoo Finance with retry logic and
optional local caching. Never configures logging at import time.
"""

# from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Optional

import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)


# ------------------------------------------------------------------
# helpers
# ------------------------------------------------------------------

def _flatten_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Flatten MultiIndex column names that yfinance returns when downloading a single ticker."""
    if isinstance(df.columns, pd.MultiIndex):
        df = df.copy()
        df.columns = [
            "_".join(str(part) for part in col if part).strip() for col in df.columns.values
        ]
    return df


def _standardize_ohlcv(df: pd.DataFrame) -> pd.DataFrame:
    """
    Ensure the DataFrame has canonical OHLCV column names.

    yfinance sometimes returns columns like ``Close_AAPL`` or ``AAPL_Close``
    when the multi-ticker interface is triggered. This normalises them.
    """
    df = df.copy()
    required = ["Open", "High", "Low", "Close", "Volume"]

    rename_map: dict[str, str] = {}
    for target in required:
        if target in df.columns:
            continue
        # Look for a suffix or prefix match (case-insensitive)
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
        raise ValueError(f"downloaded data missing required columns {missing}; got {list(df.columns)}")

    return df


# ------------------------------------------------------------------
# main class
# ------------------------------------------------------------------


class DataFetcher:
    """
    Fetch and locally persist Yahoo Finance historical data.

    Parameters
    ----------
    data_path
        Directory in which CSV files are stored.
    default_period, default_interval
        yfinance ``period`` and ``interval`` values used when the caller
        does not specify them.
    max_retries
        Number of times to retry a failing download before giving up.
    retry_backoff
        Seconds slept between retries; doubles on every failure.
    """

    def __init__(
        self,
        data_path: str | Path = "data_storage/historical/",
        default_period: str = "6mo",
        default_interval: str = "1d",
        max_retries: int = 3,
        retry_backoff: float = 1.0,
    ) -> None:
        self.data_path = Path(data_path)
        self.default_period = default_period
        self.default_interval = default_interval
        self.max_retries = max_retries
        self.retry_backoff = retry_backoff

        self.data_path.mkdir(parents=True, exist_ok=True)
        logger.debug("DataFetcher initialised at %s", self.data_path)

    # ------------------------------------------------------------------
    # download
    # ------------------------------------------------------------------

    def fetch_historical(
        self,
        ticker: str,
        period: Optional[str] = None,
        interval: Optional[str] = None,
        start: Optional[str] = None,
        end: Optional[str] = None,
    ) -> pd.DataFrame:
        """
        Download OHLCV data for ``ticker`` from Yahoo Finance.

        Uses ``start``/``end`` if both are given, otherwise falls back to
        ``period``. Raises ``ValueError`` if the ticker is unknown or the
        response is empty.
        """
        if not ticker or not isinstance(ticker, str):
            raise ValueError(f"invalid ticker: {ticker!r}")

        period = period or self.default_period
        interval = interval or self.default_interval
        ticker = ticker.strip().upper()

        logger.info("fetching %s period=%s interval=%s", ticker, period, interval)

        # Download with retries
        last_exc: Optional[Exception] = None
        backoff = self.retry_backoff
        for attempt in range(1, self.max_retries + 1):
            try:
                if start and end:
                    data = yf.download(
                        ticker,
                        start=start,
                        end=end,
                        interval=interval,
                        progress=False,
                        auto_adjust=True,
                        threads=False,
                    )
                else:
                    data = yf.download(
                        ticker,
                        period=period,
                        interval=interval,
                        progress=False,
                        auto_adjust=True,
                        threads=False,
                    )
                break
            except Exception as exc:  # noqa: BLE001 — yfinance raises many types
                last_exc = exc
                logger.warning(
                    "yfinance attempt %d/%d failed for %s: %s",
                    attempt, self.max_retries, ticker, exc,
                )
                if attempt < self.max_retries:
                    time.sleep(backoff)
                    backoff *= 2
        else:
            raise RuntimeError(f"failed to fetch {ticker} after {self.max_retries} attempts") from last_exc

        if data is None or data.empty:
            raise ValueError(f"no data returned for ticker {ticker!r}")

        data = _flatten_columns(data)
        data = _standardize_ohlcv(data)

        # Attach ticker but keep it out of the numeric feature space by using a category
        data["Ticker"] = pd.Categorical([ticker] * len(data))

        if len(data) < 2:
            logger.warning("only %d rows returned for %s — data may be insufficient", len(data), ticker)

        logger.info("fetched %d rows for %s (%s → %s)",
                    len(data), ticker, data.index.min().date(), data.index.max().date())
        return data

    # ------------------------------------------------------------------
    # persistence
    # ------------------------------------------------------------------

    def _default_filename(self, ticker: str, period: str, interval: str) -> str:
        return f"{ticker.upper()}_{period}_{interval}.csv"

    def save_to_csv(
        self,
        data: pd.DataFrame,
        ticker: str,
        period: Optional[str] = None,
        interval: Optional[str] = None,
    ) -> Path:
        """Persist ``data`` to CSV in ``self.data_path`` and return the file path."""
        period = period or self.default_period
        interval = interval or self.default_interval
        path = self.data_path / self._default_filename(ticker, period, interval)

        path.parent.mkdir(parents=True, exist_ok=True)
        data.to_csv(path, index=True)
        logger.info("saved %d rows to %s", len(data), path)
        return path

    def load_from_csv(
        self,
        ticker: str,
        period: Optional[str] = None,
        interval: Optional[str] = None,
        filepath: Optional[str | Path] = None,
    ) -> pd.DataFrame:
        """Load previously saved CSV data. Raises ``FileNotFoundError`` if the file is missing."""
        if filepath is not None:
            path = Path(filepath)
        else:
            period = period or self.default_period
            interval = interval or self.default_interval
            path = self.data_path / self._default_filename(ticker, period, interval)

        if not path.exists():
            raise FileNotFoundError(f"CSV not found: {path}")

        data = pd.read_csv(path, index_col=0, parse_dates=True)
        logger.info("loaded %d rows from %s", len(data), path)
        return data

    def fetch_and_save(
        self,
        ticker: str,
        period: Optional[str] = None,
        interval: Optional[str] = None,
        start: Optional[str] = None,
        end: Optional[str] = None,
    ) -> Path:
        """Convenience wrapper: fetch, save, return the file path."""
        data = self.fetch_historical(ticker, period, interval, start, end)
        return self.save_to_csv(data, ticker, period, interval)

    # ------------------------------------------------------------------
    # introspection
    # ------------------------------------------------------------------

    def get_available_tickers(self) -> list[str]:
        """Return the sorted, unique list of tickers for which CSV data exists."""
        tickers = {file.stem.split("_", maxsplit=1)[0] for file in self.data_path.glob("*.csv")}
        return sorted(tickers)

    def get_data_summary(self, ticker: str) -> dict:
        """Return a small dictionary describing the stored data for ``ticker``."""
        try:
            data = self.load_from_csv(ticker)
        except FileNotFoundError:
            return {"ticker": ticker, "error": "no data found"}

        return {
            "ticker": ticker,
            "rows": len(data),
            "columns": list(data.columns),
            "start_date": data.index.min().strftime("%Y-%m-%d"),
            "end_date": data.index.max().strftime("%Y-%m-%d"),
        }


# ------------------------------------------------------------------
# CLI test
# ------------------------------------------------------------------

# def _demo() -> None:
#     """Small self-check runnable with ``python -m src.data.fetcher``."""
#     logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-7s  %(message)s")

#     fetcher = DataFetcher()
#     print("fetching AAPL / 1mo …")
#     df = fetcher.fetch_historical("AAPL", period="1mo")
#     print(f"  → {len(df)} rows, columns: {list(df.columns)}")

#     print("saving …")
#     path = fetcher.save_to_csv(df, "AAPL", period="1mo")
#     print(f"  → {path}")

#     print("loading back …")
#     df2 = fetcher.load_from_csv("AAPL", period="1mo")
#     print(f"  → {len(df2)} rows")

#     print("summary:", fetcher.get_data_summary("AAPL"))


# if __name__ == "__main__":
#     _demo()

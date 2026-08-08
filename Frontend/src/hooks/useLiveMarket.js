import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/client';
import { getCached, setCache } from '../api/cache';

export function useMarketStatus() {
  const [status, setStatus] = useState(() => getCached('market-status', 60000) || { is_open: false, status: 'Loading...', next_event: '' });

  const fetch = useCallback(async () => {
    try {
      const { data } = await api.get('/api/v1/live/market-status');
      setStatus(data);
      setCache('market-status', data);
    } catch {
      setStatus({ is_open: false, status: 'Offline', next_event: '' });
    }
  }, []);

  useEffect(() => {
    if (!getCached('market-status', 60000)) fetch();
    const id = setInterval(fetch, 60000);
    return () => clearInterval(id);
  }, [fetch]);

  return status;
}

export function useLiveQuote(ticker, pollInterval = 10000) {
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef(null);

  const fetch = useCallback(async () => {
    if (!ticker) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/api/v1/live/${ticker}/quote`);
      setQuote(data);
    } catch {
      // keep last quote on error
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  useEffect(() => {
    fetch();
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(fetch, pollInterval);
    return () => clearInterval(intervalRef.current);
  }, [fetch, pollInterval]);

  return { quote, loading, refetch: fetch };
}

export function useIntraday(ticker, interval = '5m') {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!ticker) return;
    setLoading(true);
    try {
      const { data: d } = await api.get(`/api/v1/live/${ticker}/intraday`, { params: { interval } });
      setData(Array.isArray(d) ? d : []);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [ticker, interval]);

  useEffect(() => {
    fetch();
    const id = setInterval(fetch, 30000);
    return () => clearInterval(id);
  }, [fetch]);

  return { data, loading, refetch: fetch };
}

export function useChartData(ticker, period = '6mo', interval = '1d', isMarketOpen = false) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef(null);

  const doFetch = useCallback(async (signal) => {
    if (!ticker) return;
    setLoading(true);
    try {
      const { data: d } = await api.get(`/api/v1/live/${ticker}/chart`, {
        params: { period, interval },
        ...(signal ? { signal } : {}),
      });
      setData(Array.isArray(d) ? d : []);
    } catch (e) {
      if (e?.code !== 'ERR_CANCELED' && e?.name !== 'AbortError') setData([]);
    } finally {
      setLoading(false);
    }
  }, [ticker, period, interval]);

  useEffect(() => {
    const controller = new AbortController();
    doFetch(controller.signal);
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (isMarketOpen) {
      const ms = ['1m', '2m', '5m'].includes(interval) ? 15000 : 60000;
      intervalRef.current = setInterval(() => doFetch(), ms);
    }
    return () => { controller.abort(); if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [doFetch, isMarketOpen, interval]);

  return { data, loading, refetch: doFetch };
}

function _isAbort(e) {
  return e?.code === 'ERR_CANCELED' || e?.name === 'AbortError';
}

export function useFactorAnalysis(ticker, weights, pollMs = 0) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef(null);

  const fetch = useCallback(async (signal) => {
    if (!ticker) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/api/v1/analysis/${ticker}/factors`, {
        params: {
          w_sentiment: weights.sentiment,
          w_momentum: weights.momentum,
          w_valuation: weights.valuation,
          w_volatility: weights.volatility,
          w_volume: weights.volume,
          w_growth: weights.growth,
        },
        ...(signal ? { signal } : {}),
      });
      setAnalysis(data);
    } catch (e) {
      if (!_isAbort(e)) setAnalysis(null);
    } finally {
      setLoading(false);
    }
  }, [ticker, weights.sentiment, weights.momentum, weights.valuation, weights.volatility, weights.volume, weights.growth]);

  useEffect(() => {
    const c = new AbortController();
    fetch(c.signal);
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (pollMs > 0) intervalRef.current = setInterval(() => fetch(), pollMs);
    return () => { c.abort(); if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetch, pollMs]);

  return { analysis, loading, refetch: fetch };
}

export function useBacktest(ticker, period = '1y', weights = null, risk = 'Moderate', horizon = 'Medium', pollMs = 0) {
  const [backtest, setBacktest] = useState(null);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef(null);

  const fetch = useCallback(async (signal) => {
    if (!ticker) return;
    setLoading(true);
    try {
      const params = { period, risk, horizon };
      if (weights) {
        params.w_sentiment = weights.sentiment;
        params.w_momentum = weights.momentum;
        params.w_valuation = weights.valuation;
        params.w_volatility = weights.volatility;
        params.w_volume = weights.volume;
        params.w_growth = weights.growth;
      }
      const { data } = await api.get(`/api/v1/analysis/${ticker}/backtest`, {
        params,
        ...(signal ? { signal } : {}),
      });
      setBacktest(data);
    } catch (e) {
      if (!_isAbort(e)) setBacktest(null);
    } finally {
      setLoading(false);
    }
  }, [ticker, period, risk, horizon, weights?.sentiment, weights?.momentum, weights?.valuation, weights?.volatility, weights?.volume, weights?.growth]);

  useEffect(() => {
    const c = new AbortController();
    fetch(c.signal);
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (pollMs > 0) intervalRef.current = setInterval(() => fetch(), pollMs);
    return () => { c.abort(); if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetch, pollMs]);

  return { backtest, loading, refetch: fetch };
}

export function useBullBear(ticker, pollMs = 0) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef(null);

  const fetch = useCallback(async (signal) => {
    if (!ticker) return;
    setLoading(true);
    try {
      const { data: d } = await api.get(`/api/v1/analysis/${ticker}/bull-bear`, {
        ...(signal ? { signal } : {}),
      });
      setData(d);
    } catch (e) {
      if (!_isAbort(e)) setData(null);
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  useEffect(() => {
    const c = new AbortController();
    fetch(c.signal);
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (pollMs > 0) intervalRef.current = setInterval(() => fetch(), pollMs);
    return () => { c.abort(); if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetch, pollMs]);

  return { data, loading, refetch: fetch };
}

export function useSentiment(ticker, pollMs = 0) {
  const [sentiment, setSentiment] = useState(null);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef(null);

  const fetch = useCallback(async (signal) => {
    if (!ticker) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/api/v1/sentiment/${ticker}`, {
        ...(signal ? { signal } : {}),
      });
      setSentiment(data);
    } catch (e) {
      if (!_isAbort(e)) setSentiment(null);
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  useEffect(() => {
    const c = new AbortController();
    fetch(c.signal);
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (pollMs > 0) intervalRef.current = setInterval(() => fetch(), pollMs);
    return () => { c.abort(); if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetch, pollMs]);

  return { sentiment, loading, refetch: fetch };
}

export function useFundamentals(ticker, pollMs = 0) {
  const [fundamentals, setFundamentals] = useState(null);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef(null);

  const fetch = useCallback(async (signal) => {
    if (!ticker) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/api/v1/analysis/${ticker}/fundamentals`, {
        ...(signal ? { signal } : {}),
      });
      setFundamentals(data);
    } catch (e) {
      if (!_isAbort(e)) setFundamentals(null);
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  useEffect(() => {
    const c = new AbortController();
    fetch(c.signal);
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (pollMs > 0) intervalRef.current = setInterval(() => fetch(), pollMs);
    return () => { c.abort(); if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetch, pollMs]);

  return { fundamentals, loading, refetch: fetch };
}

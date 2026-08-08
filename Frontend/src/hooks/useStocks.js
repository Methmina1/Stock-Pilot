import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import { getCached, setCache } from '../api/cache';

const KEY = 'stocks';

export function useStocks() {
  const [stocks, setStocks] = useState(() => getCached(KEY, 120000) || []);
  const [loading, setLoading] = useState(!getCached(KEY, 120000));
  const [error, setError] = useState(null);

  const fetchStocks = useCallback(async () => {
    setError(null);
    try {
      const { data } = await api.get('/api/v1/stocks');
      const items = Array.isArray(data) ? data : data.items || [];
      setStocks(items);
      setCache(KEY, items);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load stocks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (getCached(KEY, 120000)) { setLoading(false); return; }
    fetchStocks();
  }, [fetchStocks]);

  return { stocks, loading, error, refetch: fetchStocks };
}

export function useStockDetail(ticker) {
  const [stock, setStock] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchStock = useCallback(async () => {
    if (!ticker) return;
    const cacheKey = `stock:${ticker}`;
    const cached = getCached(cacheKey, 60000);
    if (cached) { setStock(cached); return; }
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/api/v1/stocks/${ticker}`);
      setStock(data);
      setCache(cacheKey, data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load stock');
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  useEffect(() => { fetchStock(); }, [fetchStock]);

  return { stock, loading, error, refetch: fetchStock };
}

export function usePriceHistory(ticker, days = 60) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchHistory = useCallback(async () => {
    if (!ticker) return;
    const cacheKey = `history:${ticker}:${days}`;
    const cached = getCached(cacheKey, 60000);
    if (cached) { setHistory(cached); return; }
    setLoading(true);
    try {
      const { data } = await api.get(`/api/v1/stocks/${ticker}/history`, { params: { days } });
      const items = Array.isArray(data) ? data : data.items || [];
      setHistory(items);
      setCache(cacheKey, items);
    } catch {
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [ticker, days]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  return { history, loading, refetch: fetchHistory };
}

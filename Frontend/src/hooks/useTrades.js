import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import { getCached, setCache, clearCache } from '../api/cache';

const KEY = 'trades';

export function useTrades() {
  const [trades, setTrades] = useState(() => getCached(KEY) || []);
  const [loading, setLoading] = useState(!getCached(KEY));
  const [error, setError] = useState(null);

  const fetchTrades = useCallback(async () => {
    setError(null);
    try {
      const { data } = await api.get('/api/v1/trades');
      const items = Array.isArray(data) ? data : data.items || [];
      setTrades(items);
      setCache(KEY, items);
    } catch (err) {
      setError(err);
      setTrades([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (getCached(KEY)) { setLoading(false); return; }
    fetchTrades();
  }, [fetchTrades]);

  const createTrade = async (trade) => {
    const { data } = await api.post('/api/v1/trades', trade);
    clearCache(KEY);
    await fetchTrades();
    return data;
  };

  const deleteTrade = async (id) => {
    await api.delete(`/api/v1/trades/${id}`);
    clearCache(KEY);
    await fetchTrades();
  };

  return { trades, loading, error, refetch: fetchTrades, createTrade, deleteTrade };
}

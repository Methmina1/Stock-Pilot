import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import { getCached, setCache, clearCache } from '../api/cache';

const KEY = 'watchlist';

export function useWatchlist() {
  const [watchlist, setWatchlist] = useState(() => getCached(KEY) || []);
  const [loading, setLoading] = useState(!getCached(KEY));
  const [error, setError] = useState(null);

  const fetchWatchlist = useCallback(async () => {
    setError(null);
    try {
      const { data } = await api.get('/api/v1/watchlist');
      const items = Array.isArray(data) ? data : data.items || [];
      setWatchlist(items);
      setCache(KEY, items);
    } catch (err) {
      setError(err);
      setWatchlist([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (getCached(KEY)) { setLoading(false); return; }
    fetchWatchlist();
  }, [fetchWatchlist]);

  const addToWatchlist = async (ticker) => {
    await api.post('/api/v1/watchlist', { ticker });
    clearCache(KEY);
    await fetchWatchlist();
  };

  const removeFromWatchlist = async (ticker) => {
    await api.delete(`/api/v1/watchlist/${ticker}`);
    clearCache(KEY);
    await fetchWatchlist();
  };

  return { watchlist, loading, error, refetch: fetchWatchlist, addToWatchlist, removeFromWatchlist };
}

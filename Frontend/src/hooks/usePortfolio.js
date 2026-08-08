import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import { getCached, setCache, clearCache } from '../api/cache';

const KEY = 'portfolio';

export function usePortfolio() {
  const [holdings, setHoldings] = useState(() => getCached(KEY) || []);
  const [loading, setLoading] = useState(!getCached(KEY));
  const [error, setError] = useState(null);

  const fetchHoldings = useCallback(async () => {
    setError(null);
    try {
      const { data } = await api.get('/api/v1/portfolio');
      const items = Array.isArray(data) ? data : data.items || [];
      setHoldings(items);
      setCache(KEY, items);
    } catch (err) {
      setError(err);
      setHoldings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (getCached(KEY)) { setLoading(false); return; }
    fetchHoldings();
  }, [fetchHoldings]);

  const addHolding = async (holding) => {
    const { data } = await api.post('/api/v1/portfolio', holding);
    clearCache(KEY);
    await fetchHoldings();
    return data;
  };

  const updateHolding = async (id, updates) => {
    const { data } = await api.put(`/api/v1/portfolio/${id}`, updates);
    clearCache(KEY);
    await fetchHoldings();
    return data;
  };

  const deleteHolding = async (id) => {
    await api.delete(`/api/v1/portfolio/${id}`);
    clearCache(KEY);
    await fetchHoldings();
  };

  return { holdings, loading, error, refetch: fetchHoldings, addHolding, updateHolding, deleteHolding };
}

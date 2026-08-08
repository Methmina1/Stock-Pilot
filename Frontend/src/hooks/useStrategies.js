import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';

export function useStrategies() {
  const [strategies, setStrategies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchStrategies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/api/v1/strategies');
      setStrategies(Array.isArray(data) ? data : data.items || []);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load strategies');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStrategies(); }, [fetchStrategies]);

  const createStrategy = async (strategy) => {
    const { data } = await api.post('/api/v1/strategies', strategy);
    await fetchStrategies();
    return data;
  };

  const updateStrategy = async (id, updates) => {
    const { data } = await api.put(`/api/v1/strategies/${id}`, updates);
    await fetchStrategies();
    return data;
  };

  const deleteStrategy = async (id) => {
    await api.delete(`/api/v1/strategies/${id}`);
    await fetchStrategies();
  };

  return { strategies, loading, error, refetch: fetchStrategies, createStrategy, updateStrategy, deleteStrategy };
}

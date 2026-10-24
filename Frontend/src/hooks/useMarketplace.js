import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import { getCached, setCache } from '../api/cache';

const KEY = 'marketplace';

export function useMarketplace() {
  const [listings, setListings] = useState(() => getCached(KEY, 60000) || []);
  const [loading, setLoading] = useState(!getCached(KEY, 60000));
  const [error, setError] = useState(null);

  const fetchListings = useCallback(async () => {
    setError(null);
    try {
      const { data } = await api.get('/api/v1/marketplace/listings');
      const items = Array.isArray(data) ? data : data.items || [];
      setListings(items);
      setCache(KEY, items);
    } catch (err) {
      setError(err);
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (getCached(KEY, 60000)) { setLoading(false); return; }
    fetchListings();
  }, [fetchListings]);

  return { listings, loading, error, refetch: fetchListings };
}

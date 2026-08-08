import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import { getCached, setCache, clearCache } from '../api/cache';

const KEY = 'marketplace';

export function useMarketplace() {
  const [listings, setListings] = useState(() => getCached(KEY, 60000) || []);
  const [loading, setLoading] = useState(!getCached(KEY, 60000));
  const [error, setError] = useState(null);

  const fetchListings = useCallback(async () => {
    setError(null);
    try {
      const { data } = await api.get('/api/v1/marketplace');
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

  const purchaseListing = async (listingId) => {
    const { data } = await api.post(`/api/v1/marketplace/${listingId}/purchase`);
    return data;
  };

  const rateListing = async (listingId, rating, review) => {
    const { data } = await api.post(`/api/v1/marketplace/${listingId}/rate`, { rating, review });
    clearCache(KEY);
    await fetchListings();
    return data;
  };

  return { listings, loading, error, refetch: fetchListings, purchaseListing, rateListing };
}

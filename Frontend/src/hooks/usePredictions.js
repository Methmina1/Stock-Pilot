import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import { getCached, setCache } from '../api/cache';

const KEY = 'predictions';

export function usePredictions() {
  const [predictions, setPredictions] = useState(() => getCached(KEY, 60000) || []);
  const [loading, setLoading] = useState(!getCached(KEY, 60000));
  const [error, setError] = useState(null);

  const fetchPredictions = useCallback(async () => {
    setError(null);
    try {
      const { data } = await api.get('/api/v1/predictions');
      const items = Array.isArray(data) ? data : data.items || [];
      setPredictions(items);
      setCache(KEY, items);
    } catch (err) {
      setError(err);
      setPredictions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (getCached(KEY, 60000)) { setLoading(false); return; }
    fetchPredictions();
  }, [fetchPredictions]);

  return { predictions, loading, error, refetch: fetchPredictions };
}

/**
 * Live XGBoost model prediction for a ticker.
 *
 * Calls the model on the server (fetch history -> rebuild features -> predict) and
 * persists the result, so it is noticeably slower than reading the stored history.
 * Only runs when `enabled` is true so a screen can defer it until it is needed.
 */
export function useLivePrediction(ticker, enabled = true) {
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const run = useCallback(async () => {
    if (!ticker || !enabled) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/api/v1/predictions/${ticker}/live`, { timeout: 60000 });
      setPrediction(data);
    } catch (err) {
      setError(err);
      setPrediction(null);
    } finally {
      setLoading(false);
    }
  }, [ticker, enabled]);

  useEffect(() => { run(); }, [run]);

  return { prediction, loading, error, refetch: run };
}

export function usePrediction(ticker) {
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchPrediction = useCallback(async () => {
    if (!ticker) return;
    const cacheKey = `prediction:${ticker}`;
    const cached = getCached(cacheKey, 60000);
    if (cached) { setPrediction(cached); return; }
    setLoading(true);
    try {
      const { data } = await api.get(`/api/v1/predictions/${ticker}`);
      setPrediction(data);
      setCache(cacheKey, data);
    } catch {
      setPrediction(null);
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  useEffect(() => { fetchPrediction(); }, [fetchPrediction]);

  return { prediction, loading, refetch: fetchPrediction };
}

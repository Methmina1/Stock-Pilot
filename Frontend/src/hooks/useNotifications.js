import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import { getCached, setCache } from '../api/cache';

const KEY = 'notifications';

export function useNotifications() {
  const cached = getCached(KEY, 30000);
  const [notifications, setNotifications] = useState(() => cached?.items || []);
  const [unreadCount, setUnreadCount] = useState(() => cached?.unread || 0);
  const [loading, setLoading] = useState(!cached);

  const fetchNotifications = useCallback(async () => {
    try {
      const { data } = await api.get('/api/v1/notifications');
      const items = Array.isArray(data) ? data : data.items || [];
      const unread = items.filter((n) => !n.is_read).length;
      setNotifications(items);
      setUnreadCount(unread);
      setCache(KEY, { items, unread });
    } catch {
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (cached) { setLoading(false); return; }
    fetchNotifications();
  }, [fetchNotifications]);

  const markAsRead = async (id) => {
    try {
      await api.put(`/api/v1/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch { /* silent */ }
  };

  const markAllRead = async () => {
    try {
      await api.put('/api/v1/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch { /* silent */ }
  };

  return { notifications, unreadCount, loading, refetch: fetchNotifications, markAsRead, markAllRead };
}

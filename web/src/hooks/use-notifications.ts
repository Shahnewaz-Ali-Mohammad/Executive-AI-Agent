"use client";

/**
 * The bell: notifications from all workspaces and the scheduler's health.
 *
 * Polls every 30 seconds while the page is visible, and right away when the
 * tab comes back into view. `onNew` fires when new notifications arrive, so
 * the Tasks tab can refresh its "last run" details.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import type { NotificationDTO, NotificationFeedDTO, SchedulerStatusDTO } from "@/lib/types";

const POLL_MS = 30_000;

export function useNotifications(onNew?: () => void) {
  const [items, setItems] = useState<NotificationDTO[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [scheduler, setScheduler] = useState<SchedulerStatusDTO | null>(null);
  const newestRef = useRef<string | null>(null);
  const onNewRef = useRef(onNew);
  useEffect(() => {
    onNewRef.current = onNew;
  }, [onNew]);

  const apply = useCallback((feed: NotificationFeedDTO | null) => {
    if (!feed) return;
    setItems(feed.items);
    setUnreadCount(feed.unreadCount);
    setScheduler(feed.scheduler);
    const newest = feed.items[0]?.id ?? "";
    if (newestRef.current !== null && newest !== newestRef.current) onNewRef.current?.();
    newestRef.current = newest;
  }, []);

  const refresh = useCallback(async () => {
    apply(await api.notifications().catch(() => null));
  }, [apply]);

  useEffect(() => {
    const load = () => api.notifications().then(apply, () => undefined);
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [apply]);

  const markAllRead = useCallback(async () => {
    setItems((list) => list.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })));
    setUnreadCount(0);
    await api.markNotificationsRead().catch(() => undefined);
  }, []);

  /** After opening one (the server marks it read): update the list and the count. */
  const markedRead = useCallback(() => {
    void refresh();
  }, [refresh]);

  const remove = useCallback(
    async (id: string) => {
      await api.deleteNotification(id).catch(() => undefined);
      await refresh();
    },
    [refresh],
  );

  return { items, unreadCount, scheduler, refresh, markAllRead, markedRead, remove };
}

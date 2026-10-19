"use client";

/**
 * Notifications: everything that arrived under the bell, from every
 * workspace: finished reports, reminders, tasks that fell due, and anything
 * that went wrong. Open one to read it in full (reports with their sources).
 */
import { Bell, CheckCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { NOTIFICATION_ICONS } from "@/components/notifications/notification-bell";
import { useWorkspace } from "@/components/shell/workspace-context";
import { Button } from "@/components/ui/button";
import { EmptyBlock, FilterChips, ListSkeleton, Page, PageHeader } from "@/components/ui/page";
import { api } from "@/lib/api-client";
import { formatDateTime, formatFullDateTime } from "@/lib/dates";
import type { NotificationDTO, NotificationKind } from "@/lib/types";
import { cn } from "@/lib/utils";

type Filter = "all" | "unread" | NotificationKind;

const KIND_LABELS: Record<NotificationKind, string> = {
  report: "Reports",
  reminder: "Reminders",
  task_due: "Due tasks",
  key_date: "Key dates",
  error: "Problems",
};

export function NotificationsPage() {
  const ws = useWorkspace();
  const bell = ws.notifications;
  const [items, setItems] = useState<NotificationDTO[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  // Reload whenever the bell sees something new or read state changes.
  const signature = `${bell.items[0]?.id ?? ""}:${bell.unreadCount}`;
  useEffect(() => {
    let cancelled = false;
    api
      .notifications(200)
      .then((feed) => !cancelled && setItems(feed.items))
      .catch(() => !cancelled && setItems((current) => current ?? []));
    return () => {
      cancelled = true;
    };
  }, [signature]);

  const list = items ?? [];
  const visible = list.filter((n) => (filter === "all" ? true : filter === "unread" ? !n.readAt : n.kind === filter));
  const kinds = (Object.keys(KIND_LABELS) as NotificationKind[]).filter((kind) => list.some((n) => n.kind === kind));
  const openId = ws.panel?.kind === "notification" ? ws.panel.notificationId : null;
  const showWorkspace = ws.workspaces.workspaces.length > 1;

  return (
    <Page>
      <PageHeader
        title="Notifications"
        description="Scheduled reports, reminders, tasks that fell due and anything that needs your attention, from every workspace."
        actions={
          bell.unreadCount > 0 && (
            <Button variant="quiet" onClick={bell.markAllRead}>
              <CheckCheck className="size-4" aria-hidden /> Mark all as read
            </Button>
          )
        }
      />

      {items === null ? (
        <ListSkeleton />
      ) : list.length === 0 ? (
        <EmptyBlock icon={<Bell className="size-5" aria-hidden />} title="No notifications yet">
          Results of scheduled reports, reminders and tasks that fall due appear here and under the bell.
        </EmptyBlock>
      ) : (
        <>
          <div className="mb-4">
            <FilterChips
              label="Show"
              value={filter}
              onChange={setFilter}
              options={[
                { id: "all", label: "All", count: list.length },
                { id: "unread", label: "Unread", count: list.filter((n) => !n.readAt).length },
                ...kinds.map((kind) => ({ id: kind, label: KIND_LABELS[kind], count: list.filter((n) => n.kind === kind).length })),
              ]}
            />
          </div>
          {visible.length === 0 ? (
            <EmptyBlock title="Nothing here">No notifications match this filter.</EmptyBlock>
          ) : (
            <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-surface">
              {visible.map((item) => {
                const Icon = NOTIFICATION_ICONS[item.kind] ?? Bell;
                const unread = !item.readAt;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => ws.openPanel({ kind: "notification", notificationId: item.id })}
                      aria-current={openId === item.id ? "true" : undefined}
                      className={cn(
                        "flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors",
                        openId === item.id ? "bg-ledger-soft/50" : "hover:bg-paper",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                          item.kind === "error" ? "bg-alert-soft text-alert" : "bg-ledger-soft text-ledger",
                        )}
                      >
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-sm text-ink", unread && "font-semibold")}>{item.title}</span>
                        {item.preview && <span className="mt-0.5 line-clamp-2 block text-sm text-slate">{item.preview}</span>}
                        <span className="mt-1 block text-xs text-slate tabular-nums">
                          <time dateTime={item.createdAt} title={formatFullDateTime(item.createdAt)}>
                            {formatDateTime(item.createdAt)}
                          </time>
                          {showWorkspace && ` · ${item.workspaceName}`}
                        </span>
                      </span>
                      {unread && <span className="mt-2 size-2 shrink-0 rounded-full bg-ledger" aria-label="Unread" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Page>
  );
}

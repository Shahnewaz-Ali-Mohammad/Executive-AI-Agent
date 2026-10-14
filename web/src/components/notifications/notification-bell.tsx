"use client";

/**
 * The bell in the header: unread count, and a list of the latest
 * notifications (finished reports, reminders, tasks falling due, failures)
 * from every workspace. Choosing one opens it in the right-hand panel.
 */
import { AlertTriangle, Bell, BellRing, CalendarClock, ListTodo } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { IconButton } from "@/components/ui/button";
import { formatDateTime, formatFullDateTime } from "@/lib/dates";
import type { NotificationDTO, NotificationKind, SchedulerStatusDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

export const NOTIFICATION_ICONS: Record<NotificationKind, typeof Bell> = {
  report: CalendarClock,
  reminder: BellRing,
  task_due: ListTodo,
  error: AlertTriangle,
};

interface NotificationBellProps {
  items: NotificationDTO[];
  unreadCount: number;
  scheduler: SchedulerStatusDTO | null;
  /** Show which workspace each one belongs to (when there's more than one). */
  showWorkspace: boolean;
  activeId: string | null;
  onOpen: (id: string) => void;
  onMarkAllRead: () => void;
}

export function NotificationBell({
  items,
  unreadCount,
  scheduler,
  showWorkspace,
  activeId,
  onOpen,
  onMarkAllRead,
}: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on a click outside or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const schedulerDown = scheduler !== null && !scheduler.healthy;

  return (
    <div ref={rootRef} className="relative">
      <IconButton
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className="relative"
      >
        <Bell className="size-[1.1rem]" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-alert px-1 text-[0.6rem] font-semibold text-surface tabular-nums">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </IconButton>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="fixed inset-x-2 top-14 z-50 flex max-h-[75vh] flex-col overflow-hidden rounded-lg border border-rule bg-surface shadow-lg sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-1 sm:w-[24rem]"
        >
          <header className="flex items-center justify-between border-b border-rule px-4 py-2.5">
            <h2 className="text-sm font-medium text-ink">Notifications</h2>
            {unreadCount > 0 && (
              <button type="button" onClick={onMarkAllRead} className="text-xs text-ledger hover:underline">
                Mark all as read
              </button>
            )}
          </header>

          {schedulerDown && (
            <p className="border-b border-rule bg-amber-soft px-4 py-2 text-xs text-amber">
              The n8n scheduler isn&apos;t running, so nothing new will arrive. See the Tasks tab.
            </p>
          )}

          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate">
              No notifications yet. Scheduled reports, reminders and due tasks show up here.
            </p>
          ) : (
            <ul className="min-h-0 flex-1 divide-y divide-rule overflow-y-auto">
              {items.map((item) => {
                const Icon = NOTIFICATION_ICONS[item.kind] ?? Bell;
                const unread = !item.readAt;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        onOpen(item.id);
                      }}
                      aria-current={activeId === item.id ? "true" : undefined}
                      className={cn(
                        "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-paper",
                        activeId === item.id && "bg-paper",
                      )}
                    >
                      <Icon
                        className={cn("mt-0.5 size-4 shrink-0", item.kind === "error" ? "text-alert" : "text-ledger")}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block truncate text-sm text-ink", unread && "font-semibold")}>{item.title}</span>
                        {item.preview && <span className="line-clamp-2 text-xs text-ink/75">{item.preview}</span>}
                        <span className="block text-xs text-slate tabular-nums">
                          <time dateTime={item.createdAt} title={formatFullDateTime(item.createdAt)}>
                            {formatDateTime(item.createdAt)}
                          </time>
                          {showWorkspace && ` · ${item.workspaceName}`}
                        </span>
                      </span>
                      {unread && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-ledger" aria-label="Unread" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

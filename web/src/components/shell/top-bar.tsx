"use client";

/**
 * The bar above every page: menu button (phones), where you are
 * (workspace · page), a quick action for the page, and the bell.
 */
import { Menu, SquarePen } from "lucide-react";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { IconButton } from "@/components/ui/button";
import type { View } from "@/lib/routes";
import { useWorkspace } from "./workspace-context";

const TITLES: Record<Exclude<View, "chat">, string> = {
  documents: "Documents",
  forms: "Forms",
  tasks: "Tasks & schedules",
  notifications: "Notifications",
  status: "System status",
};

export function TopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const ws = useWorkspace();
  const { view, conversations: convs, notifications, panel } = ws;

  const conversationTitle = convs.conversations.find((c) => c.id === convs.activeId)?.title;
  const title = view === "chat" ? (conversationTitle ?? "New conversation") : TITLES[view];

  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center gap-2 border-b border-rule bg-paper/95 px-2 backdrop-blur sm:px-3 lg:px-6">
      <IconButton aria-label="Open menu" className="lg:hidden" onClick={onOpenMenu}>
        <Menu className="size-5" />
      </IconButton>
      <p className="min-w-0 flex-1 truncate text-sm text-ink" aria-label="You are here">
        <span className="hidden font-medium sm:inline">{ws.workspace.name}</span>
        <span className="hidden text-slate sm:inline"> / </span>
        <span className="font-medium sm:font-normal sm:text-slate">{title}</span>
      </p>
      {view === "chat" && convs.activeId && (
        <button
          type="button"
          onClick={() => ws.newConversation()}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-slate hover:bg-surface hover:text-ink"
        >
          <SquarePen className="size-3.5" aria-hidden />
          <span className="sm:hidden">New</span>
          <span className="hidden sm:inline">New conversation</span>
        </button>
      )}
      <NotificationBell
        items={notifications.items}
        unreadCount={notifications.unreadCount}
        scheduler={notifications.scheduler}
        showWorkspace={ws.workspaces.workspaces.length > 1}
        activeId={panel?.kind === "notification" ? panel.notificationId : null}
        onOpen={(id) => ws.openPanel({ kind: "notification", notificationId: id })}
        onMarkAllRead={notifications.markAllRead}
        allHref={`/w/${ws.workspaceId}/notifications`}
      />
    </header>
  );
}

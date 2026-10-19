"use client";

/**
 * The left-hand menu:
 *
 *   Workspace ▾          switch, create, rename, delete
 *   + New conversation
 *   Documents · Forms · Tasks & schedules · Notifications   (with counts)
 *   Conversations        searchable, grouped by date
 *   ● Scheduler status · Sign out
 *
 * On wide screens it's always there; on phones it slides in from the left.
 */
import { Bell, ClipboardList, FileText, ListTodo, LogOut, SquarePen, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { ConversationList } from "@/components/library/conversation-list";
import { WorkspaceSwitcher } from "@/components/library/workspace-switcher";
import { IconButton } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { api } from "@/lib/api-client";
import { lastVisited, routes, workspaceHome, type View } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useWorkspace } from "./workspace-context";

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { confirm, toast } = useFeedback();
  const ws = useWorkspace();
  const { workspaceId, view, conversations: convs } = ws;

  const openTasks = ws.automations.tasks.filter((t) => t.status === "open").length;
  const scheduler = ws.notifications.scheduler;

  const nav: { view: View; href: string; label: string; icon: ReactNode; count?: number; badge?: number }[] = [
    {
      view: "documents",
      href: routes.documents(workspaceId),
      label: "Documents",
      icon: <FileText className="size-4" aria-hidden />,
      count: ws.documents.documents.length,
    },
    {
      view: "forms",
      href: routes.forms(workspaceId),
      label: "Forms",
      icon: <ClipboardList className="size-4" aria-hidden />,
      count: ws.forms.submissions.length,
    },
    {
      view: "tasks",
      href: routes.tasks(workspaceId),
      label: "Tasks & schedules",
      icon: <ListTodo className="size-4" aria-hidden />,
      count: openTasks,
    },
    {
      view: "notifications",
      href: routes.notifications(workspaceId),
      label: "Notifications",
      icon: <Bell className="size-4" aria-hidden />,
      badge: ws.notifications.unreadCount,
    },
  ];

  async function signOut() {
    await api.logout().catch(() => undefined);
    router.replace("/login");
  }

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-ink/30 lg:hidden" onClick={onClose} aria-hidden />}
      <aside
        aria-label="Menu"
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[18rem] max-w-[85vw] flex-col border-r border-rule bg-surface transition-[transform,visibility] lg:visible lg:static lg:z-auto lg:w-[17rem] lg:translate-x-0",
          // Closed on a phone: off screen and out of reach of Tab and screen readers.
          open ? "visible translate-x-0 shadow-xl" : "invisible -translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <span className="font-serif text-lg text-ink">Executive Agent</span>
          <IconButton aria-label="Close menu" className="lg:hidden" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </div>

        <div className="space-y-2 pb-3">
          <WorkspaceSwitcher
            workspaces={ws.workspaces.workspaces}
            activeId={workspaceId}
            onSelect={(id) => {
              onClose();
              if (id !== workspaceId) router.push(workspaceHome(id));
            }}
            onCreate={async (name) => {
              const created = await ws.workspaces.create(name);
              onClose();
              toast(`Workspace “${created.name}” created`);
              router.push(routes.workspace(created.id));
            }}
            onRename={async (id, name) => {
              await ws.workspaces.rename(id, name);
              toast("Workspace renamed");
            }}
            onDelete={async (id) => {
              const target = ws.workspaces.workspaces.find((w) => w.id === id);
              const ok = await confirm({
                title: `Delete “${target?.name ?? "workspace"}”?`,
                message: "Its documents, conversations, forms, tasks and schedules are permanently removed.",
                confirmLabel: "Delete workspace",
                danger: true,
              });
              if (!ok) return;
              const remaining = await ws.workspaces.remove(id);
              lastVisited.setConversation(id, null);
              toast("Workspace deleted");
              if (id === workspaceId) {
                lastVisited.setWorkspace(remaining[0].id);
                router.replace(workspaceHome(remaining[0].id));
              }
            }}
          />
          <div className="px-3">
            <button
              type="button"
              onClick={() => {
                onClose();
                ws.newConversation();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-ledger px-3 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-90"
            >
              <SquarePen className="size-4" aria-hidden /> New conversation
            </button>
          </div>
        </div>

        <nav aria-label="Sections" className="border-y border-rule px-2 py-2">
          <ul className="space-y-0.5">
            {nav.map((item) => {
              const active = view === item.view;
              return (
                <li key={item.view}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors",
                      active ? "bg-ledger-soft font-medium text-ledger" : "text-ink/85 hover:bg-paper hover:text-ink",
                    )}
                  >
                    <span className={cn(active ? "text-ledger" : "text-slate")}>{item.icon}</span>
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge ? (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-alert px-1.5 text-[0.65rem] font-semibold text-surface tabular-nums">
                        {item.badge > 99 ? "99+" : item.badge}
                      </span>
                    ) : item.count ? (
                      <span className="text-xs text-slate tabular-nums">{item.count}</span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex min-h-0 flex-1 flex-col pt-3">
          <h2 className="px-4 pb-2 text-[0.7rem] font-medium tracking-wide text-slate uppercase">Conversations</h2>
          <div className="min-h-0 flex-1 overflow-y-auto pb-3">
            <ConversationList
              conversations={convs.conversations}
              activeId={view === "chat" ? convs.activeId : null}
              loading={convs.loading}
              hrefFor={(id) => routes.chat(workspaceId, id)}
              onNavigate={onClose}
              onRename={async (id, title) => {
                await convs.rename(id, title);
                toast("Conversation renamed");
              }}
              onDelete={async (id) => {
                const target = convs.conversations.find((c) => c.id === id);
                const ok = await confirm({
                  title: "Delete this conversation?",
                  message: <>“{target?.title}” is removed. Documents, saved forms and tasks are kept.</>,
                  confirmLabel: "Delete",
                  danger: true,
                });
                if (!ok) return;
                await convs.remove(id);
                toast("Conversation deleted");
                if (id === convs.activeId) ws.newConversation();
              }}
            />
          </div>
        </div>

        <div className="space-y-0.5 border-t border-rule p-2">
          <Link
            href={routes.status(workspaceId)}
            onClick={onClose}
            aria-current={view === "status" ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors hover:bg-paper",
              view === "status" ? "bg-paper text-ink" : "text-slate hover:text-ink",
            )}
          >
            <span
              className={cn(
                "size-2 rounded-full",
                scheduler === null ? "bg-rule" : scheduler.healthy ? "bg-ledger" : "bg-amber",
              )}
              aria-hidden
            />
            <span className="flex-1">System status</span>
            {scheduler && !scheduler.healthy && <span className="text-xs text-amber">Check</span>}
          </Link>
          <button
            type="button"
            onClick={signOut}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-slate hover:bg-paper hover:text-ink"
          >
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </div>
      </aside>
    </>
  );
}

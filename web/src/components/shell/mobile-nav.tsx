"use client";

/** Bottom tab bar on phones: Chat · Documents · Forms · Tasks. */
import { ClipboardList, FileText, ListTodo, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { routes, workspaceHome, type View } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useWorkspace } from "./workspace-context";

export function MobileNav() {
  const router = useRouter();
  const ws = useWorkspace();
  const { workspaceId, view } = ws;
  const openTasks = ws.automations.tasks.filter((t) => t.status === "open").length;

  const items: { view: View; href: string; label: string; Icon: typeof FileText; badge?: number }[] = [
    { view: "chat", href: routes.chat(workspaceId, ws.conversations.activeId), label: "Chat", Icon: MessageSquare },
    { view: "documents", href: routes.documents(workspaceId), label: "Documents", Icon: FileText },
    { view: "forms", href: routes.forms(workspaceId), label: "Forms", Icon: ClipboardList },
    { view: "tasks", href: routes.tasks(workspaceId), label: "Tasks", Icon: ListTodo, badge: openTasks },
  ];

  return (
    <nav
      aria-label="Tab bar"
      className="flex shrink-0 border-t border-rule bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {items.map(({ view: target, href, label, Icon, badge }) => {
        const active = view === target;
        return (
          <Link
            key={target}
            href={href}
            onClick={(event) => {
              // Chat: back to the conversation last open in this workspace.
              if (target === "chat" && !ws.conversations.activeId) {
                event.preventDefault();
                router.push(workspaceHome(workspaceId));
              }
            }}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[0.7rem] transition-colors",
              active ? "text-ledger" : "text-slate",
            )}
          >
            <Icon className="size-5" aria-hidden />
            {label}
            {badge ? (
              <span className="absolute top-1 left-1/2 ml-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-ledger px-1 text-[0.6rem] font-semibold text-surface tabular-nums">
                {badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
